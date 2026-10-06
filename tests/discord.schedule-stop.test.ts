/**
 * AGENT-3.c (REQ-discord-304): I or the schedule's creator can stop a
 * scheduled run in progress from Discord, the same way as a chat run.
 *
 * A run the bridge's own ticker starts takes a turn on the bridge's
 * `SessionRunControl` and shows the chat runs' red **Stop** button
 * (`cvstop:<runId>`) on a progress message in the schedule's channel — or,
 * for a schedule with no channel, in the owner's DM. A press (or a 'stop' /
 * 'cancel' reply to the progress message) from the creator or the owner
 * aborts the run once (its agent's process tree is killed through the same
 * signal); anyone else gets "This Stop button isn't for you.". The stopped
 * run's message becomes `⏹ Stopped`, nothing else is posted, the run row is
 * `failed` / `stopped` with who stopped it, the schedule's failure count is
 * left as it is and no ask is stored, so its next due run goes ahead and
 * posts as before (its progress message is removed when it ends).
 *
 * Dry-run bridges with a fake gateway and the in-memory outbound, memory
 * SQLite, stub agents that wait until the test finishes them (an abort ends
 * them like a killed process); `SchedulerService` units with a fake stop
 * control. No network, no model call.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import {
  RUN_STOP_ACK,
  RUN_STOP_NOTHING_RUNNING,
  RUN_STOP_NOT_YOURS,
  RUN_STOPPED_TEXT,
  SessionRunControl,
  parseStopRunCustomId,
} from "../src/discord/run-control.ts";
import { createScheduleRunStop } from "../src/discord/schedule-stop.ts";
import type { AgentSpawnResult, InboundMessage } from "../src/discord/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { FAILURE_AUTO_PAUSE, SchedulerService, type ScheduleRunStop } from "../src/scheduler/service.ts";
import { ScheduleStore, type Schedule } from "../src/scheduler/store.ts";

const OWNER = "111100002222000033";
const ALICE = "200000000000000002";
const BOB = "300000000000000003";
const CHAN = "chan-1";

const temps: string[] = [];
function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

async function until(cond: () => boolean, ms = 5000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(5);
  }
  return cond();
}

type Gate = {
  input: AgentRunChatOpts;
  finish: (over?: Partial<AgentSpawnResult>) => void;
  aborts: number;
};

/** Runs wait until the test finishes them; an abort ends one like a killed process (exit 137). */
function gatedAgent() {
  const runs: Gate[] = [];
  const agent: AgentClient = {
    runChat(input) {
      return new Promise((resolveRun) => {
        const gate: Gate = {
          input,
          aborts: 0,
          finish: (over = {}) =>
            resolveRun({ ok: true, sessionId: input.sessionId, summary: "all good", exitCode: 0, ...over }),
        };
        input.signal?.addEventListener("abort", () => {
          gate.aborts += 1;
          resolveRun({ ok: false, sessionId: input.sessionId, summary: "", exitCode: 137 });
        });
        runs.push(gate);
      });
    },
  };
  return { agent, runs };
}

type Db = ReturnType<typeof openCorvidinhoDb>;

function seedDue(db: Db, opts: { name: string; creator: string; channelId?: string }): Schedule {
  const store = new ScheduleStore({ db });
  const s = store.create({
    name: opts.name,
    cronExpression: "0 * * * *",
    project: ".",
    prompt: "summarize",
    createdByUserId: opts.creator,
    ...(opts.channelId ? { channelId: opts.channelId } : {}),
  });
  makeDue(db, s.id);
  return s;
}

function makeDue(db: Db, id: string): void {
  db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1_000, id]);
}

type RunRow = {
  status: string;
  summary: string | null;
  error: string | null;
  ask_reason: string | null;
  completed_at: number | null;
};
function runsOf(db: Db, scheduleId: string): RunRow[] {
  return db
    .query(
      "SELECT status, summary, error, ask_reason, completed_at FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at, rowid",
    )
    .all(scheduleId) as RunRow[];
}
function scheduleRow(db: Db, id: string) {
  return db
    .query("SELECT status, consecutive_failures, next_run_at FROM schedules WHERE id = ?")
    .get(id) as { status: string; consecutive_failures: number; next_run_at: number };
}

type PressReply = { content?: string; ephemeral?: boolean };
let pressSeq = 0;
async function press(
  handlers: GatewayHandlers,
  opts: { customId: string; userId: string; messageId: string; channelId: string; guildId?: string },
): Promise<PressReply[]> {
  const replies: PressReply[] = [];
  pressSeq += 1;
  await handlers.onComponent!({
    id: `ixs_${pressSeq}`,
    customId: opts.customId,
    channelId: opts.channelId,
    userId: opts.userId,
    messageId: opts.messageId,
    ...(opts.guildId ? { guildId: opts.guildId } : {}),
    reply: async (o) => {
      replies.push(o);
    },
  });
  return replies;
}

async function scheduleBridge(agent: AgentClient) {
  const dir = tempDir("corvidinho-sched-stop-");
  const db = openCorvidinhoDb({ memory: true });
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Array<{ channelId: string; content: string; replyToMessageId?: string }> = [];
  const dms: Array<{ userId: string; content: string; components?: unknown[] }> = [];
  const dmEdits: Array<{ channelId: string; messageId: string; content?: string | null; components?: unknown[] | null }> = [];
  const dmDeletes: Array<{ channelId: string; messageId: string }> = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
      CORVIDINHO_ALLOWLIST_FILE: join(dir, "none.toml"),
      CORVIDINHO_DATA_DIR: dir,
      HOME: dir,
    },
    db,
    projectRoot: mkdtempSync(join(dir, "proj-")),
    skipProtocolCheck: true,
    approvalPollMs: 0,
    schedulerPollIntervalMs: 20,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (o) => {
        replies.push(o);
        return { messageId: `bot_${replies.length}` };
      };
      handlers.sendDm = async (o) => {
        dms.push(o);
        return { channelId: `dm-${o.userId}`, messageId: `dm_${dms.length}` };
      };
      handlers.editMessage = async (o) => {
        dmEdits.push(o);
        return true;
      };
      handlers.deleteMessage = async (o) => {
        dmDeletes.push(o);
        return true;
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  const handlers = box.handlers;
  return {
    db,
    result,
    handlers,
    outbound,
    replies,
    dms,
    dmEdits,
    dmDeletes,
    async stop() {
      await result.stop();
      db.close();
    },
  };
}

/** The progress message (and its Stop button) a schedule run sent to `channelId`. */
function progressIn(b: Awaited<ReturnType<typeof scheduleBridge>>, channelId: string, nth = 0) {
  const sent = b.outbound.sends.filter((s) => s.channelId === channelId)[nth];
  if (!sent) return undefined;
  const row = (sent.components as Array<{ components: Array<{ custom_id: string; style: number; label: string }> }> | undefined)?.[0];
  return { ...sent, button: row?.components[0] };
}

function lastEdit(b: Awaited<ReturnType<typeof scheduleBridge>>, messageId: string) {
  return b.outbound.edits.filter((e) => e.messageId === messageId).at(-1);
}

describe("a scheduled run is stopped from Discord like a chat run (AGENT-3.c, REQ-discord-304)", () => {
  test("its progress message carries the Stop button; anyone else's press is refused; the creator's stops it, posts nothing else and leaves the schedule as it is; its next due run goes ahead", async () => {
    const { agent, runs } = gatedAgent();
    const b = await scheduleBridge(agent);
    try {
      const s = seedDue(b.db, { name: "Nightly", creator: ALICE, channelId: CHAN });
      expect(await until(() => runs.length === 1 && progressIn(b, CHAN) !== undefined)).toBe(true);
      const progress = progressIn(b, CHAN)!;
      // One red Stop button, the chat runs' custom id (cvstop:run_<n>).
      expect(progress.components).toHaveLength(1);
      expect(progress.button?.label).toBe("Stop");
      expect(progress.button?.style).toBe(4);
      const runId = parseStopRunCustomId(progress.button!.custom_id);
      expect(runId).toMatch(/^run_\d+$/);
      expect((progress.embed as { description: string }).description).toContain("⏳ Schedule **Nightly**");
      expect((progress.embed as { description: string }).description).toContain("running.");
      // The run's agent got the turn's signal (a stop kills its process tree).
      expect(runs[0]!.input.signal).toBeDefined();
      expect(runs[0]!.input.sessionId).toBe(`schedule_${s.id}`);

      // Bob is neither the creator nor the owner: the same refusal a chat run gives.
      const bob = await press(b.handlers, {
        customId: progress.button!.custom_id,
        userId: BOB,
        messageId: progress.messageId,
        channelId: CHAN,
        guildId: "g1",
      });
      expect(bob).toEqual([{ content: RUN_STOP_NOT_YOURS, ephemeral: true }]);
      expect(runs[0]!.aborts).toBe(0);

      // The creator's press stops it: the private ack only, one abort.
      const alice = await press(b.handlers, {
        customId: progress.button!.custom_id,
        userId: ALICE,
        messageId: progress.messageId,
        channelId: CHAN,
        guildId: "g1",
      });
      expect(alice).toEqual([{ content: RUN_STOP_ACK, ephemeral: true }]);
      expect(runs[0]!.aborts).toBe(1);
      expect(await until(() => runsOf(b.db, s.id)[0]?.completed_at != null)).toBe(true);

      // Recorded stopped (failed / stopped, who stopped it), no ask, not a failure.
      expect(runsOf(b.db, s.id)).toEqual([
        {
          status: "failed",
          summary: "stopped",
          error: `stopped on Discord by ${ALICE}`,
          ask_reason: null,
          completed_at: expect.any(Number),
        },
      ]);
      const after = scheduleRow(b.db, s.id);
      expect(after.status).toBe("active");
      expect(after.consecutive_failures).toBe(0);
      expect(after.next_run_at).toBeGreaterThan(Date.now());

      // The progress message says ⏹ Stopped, its button gone; nothing else is posted.
      expect(await until(() => lastEdit(b, progress.messageId)?.components === null)).toBe(true);
      expect((lastEdit(b, progress.messageId)!.embed as { description: string }).description).toBe(RUN_STOPPED_TEXT);
      expect(b.replies).toEqual([]);

      // A later press on it finds nothing running.
      const late = await press(b.handlers, {
        customId: progress.button!.custom_id,
        userId: ALICE,
        messageId: progress.messageId,
        channelId: CHAN,
        guildId: "g1",
      });
      expect(late).toEqual([{ content: RUN_STOP_NOTHING_RUNNING, ephemeral: true }]);

      // Its next due run goes ahead as usual and posts its result.
      makeDue(b.db, s.id);
      expect(await until(() => runs.length === 2 && progressIn(b, CHAN, 1) !== undefined)).toBe(true);
      const second = progressIn(b, CHAN, 1)!;
      expect(second.button?.custom_id).not.toBe(progress.button?.custom_id);
      runs[1]!.finish();
      expect(await until(() => b.replies.length === 1)).toBe(true);
      expect(b.replies[0]!.channelId).toBe(CHAN);
      expect(b.replies[0]!.content).toContain("✅ Schedule **Nightly**");
      expect(b.replies[0]!.content).toContain("all good");
      // A run that was not stopped removes its progress message.
      expect(b.outbound.deletes).toContainEqual({ channelId: CHAN, messageId: second.messageId });
      expect(runsOf(b.db, s.id).map((r) => r.status)).toEqual(["failed", "completed"]);
    } finally {
      await b.stop();
    }
  });

  test("the owner's 'stop' reply to the progress message stops someone else's scheduled run; a third user's does nothing", async () => {
    const { agent, runs } = gatedAgent();
    const b = await scheduleBridge(agent);
    try {
      const s = seedDue(b.db, { name: "Digest", creator: ALICE, channelId: CHAN });
      expect(await until(() => runs.length === 1 && progressIn(b, CHAN) !== undefined)).toBe(true);
      const progressId = progressIn(b, CHAN)!.messageId;
      const reply = (id: string, authorId: string, content: string): InboundMessage => ({
        id,
        channelId: CHAN,
        authorId,
        authorBot: false,
        content,
        mentionedBot: false,
        referencedMessageId: progressId,
      });
      await b.handlers.onMessage(reply("x1", BOB, "stop"));
      await Bun.sleep(30);
      expect(runs[0]!.aborts).toBe(0);
      expect(b.replies).toEqual([]);

      await b.handlers.onMessage(reply("s1", OWNER, "Cancel!"));
      expect(runs[0]!.aborts).toBe(1);
      expect(b.replies).toEqual([{ channelId: CHAN, content: RUN_STOP_ACK, replyToMessageId: "s1" }]);
      expect(await until(() => runsOf(b.db, s.id)[0]?.completed_at != null)).toBe(true);
      expect(runsOf(b.db, s.id)[0]).toMatchObject({
        status: "failed",
        summary: "stopped",
        error: `stopped on Discord by ${OWNER}`,
      });
      // The owner's stop started no session of theirs.
      expect(b.result.store.list()).toEqual([]);
    } finally {
      await b.stop();
    }
  });

  test("a schedule with no channel: the owner gets the Stop button by DM and a press there stops the run; a run that ends on its own deletes the DM", async () => {
    const { agent, runs } = gatedAgent();
    const b = await scheduleBridge(agent);
    try {
      const s = seedDue(b.db, { name: "Quiet", creator: OWNER });
      expect(await until(() => runs.length === 1 && b.dmEdits.length === 1)).toBe(true);
      expect(b.dms).toHaveLength(1);
      expect(b.dms[0]!.userId).toBe(OWNER);
      expect(b.dms[0]!.content).toContain("⏳ Schedule **Quiet**");
      // The button is added to that DM once the run holds its turn.
      const edit = b.dmEdits[0]!;
      expect(edit).toMatchObject({ channelId: `dm-${OWNER}`, messageId: "dm_1" });
      const button = (edit.components as Array<{ components: Array<{ custom_id: string; style: number }> }>)[0]!
        .components[0]!;
      expect(button.style).toBe(4);
      expect(parseStopRunCustomId(button.custom_id)).toMatch(/^run_\d+$/);
      // Nothing went to a channel.
      expect(b.outbound.sends).toEqual([]);

      // The owner's press in the DM (no guild) stops it.
      const pressed = await press(b.handlers, {
        customId: button.custom_id,
        userId: OWNER,
        messageId: "dm_1",
        channelId: `dm-${OWNER}`,
      });
      expect(pressed).toEqual([{ content: RUN_STOP_ACK, ephemeral: true }]);
      expect(runs[0]!.aborts).toBe(1);
      expect(await until(() => runsOf(b.db, s.id)[0]?.completed_at != null)).toBe(true);
      expect(runsOf(b.db, s.id)[0]).toMatchObject({
        status: "failed",
        summary: "stopped",
        error: `stopped on Discord by ${OWNER}`,
        ask_reason: null,
      });
      expect(await until(() => b.dmEdits.length === 2)).toBe(true);
      expect(b.dmEdits[1]).toMatchObject({
        channelId: `dm-${OWNER}`,
        messageId: "dm_1",
        content: RUN_STOPPED_TEXT,
        components: null,
      });
      expect(b.dmDeletes).toEqual([]);
      // A later press there finds nothing running and stops nothing.
      const late = await press(b.handlers, {
        customId: button.custom_id,
        userId: OWNER,
        messageId: "dm_1",
        channelId: `dm-${OWNER}`,
      });
      expect(late).toHaveLength(1);
      expect(late[0]!.ephemeral).toBe(true);
      expect(late[0]!.content).not.toBe(RUN_STOP_ACK);

      // The next due run ends on its own: its DM is deleted, nothing else is sent.
      makeDue(b.db, s.id);
      expect(await until(() => runs.length === 2 && b.dmEdits.length === 3)).toBe(true);
      runs[1]!.finish();
      expect(await until(() => b.dmDeletes.length === 1)).toBe(true);
      expect(b.dmDeletes[0]).toEqual({ channelId: `dm-${OWNER}`, messageId: "dm_2" });
      expect(await until(() => runsOf(b.db, s.id)[1]?.status === "completed")).toBe(true);
      expect(b.dms).toHaveLength(2);
      expect(b.replies).toEqual([]);
    } finally {
      await b.stop();
    }
  });

  test("a press in a guild channel on the DM run's message id does not skip the channel gate", async () => {
    const { agent, runs } = gatedAgent();
    const b = await scheduleBridge(agent);
    try {
      const s = seedDue(b.db, { name: "Quiet", creator: OWNER });
      expect(await until(() => runs.length === 1 && b.dmEdits.length === 1)).toBe(true);
      const button = (b.dmEdits[0]!.components as Array<{ components: Array<{ custom_id: string }> }>)[0]!
        .components[0]!;
      // Same run id and message, but pressed in another (not allowlisted) channel.
      const pressed = await press(b.handlers, {
        customId: button.custom_id,
        userId: OWNER,
        messageId: "dm_1",
        channelId: "chan-other",
        guildId: "g1",
      });
      expect(pressed).toHaveLength(1);
      expect(pressed[0]!.content).not.toBe(RUN_STOP_ACK);
      expect(runs[0]!.aborts).toBe(0);
      runs[0]!.finish();
      expect(await until(() => runsOf(b.db, s.id)[0]?.status === "completed")).toBe(true);
    } finally {
      await b.stop();
    }
  });
});

describe("SchedulerService with a stop control (AGENT-3.c)", () => {
  /** A stop control the test drives: `state.stoppedBy` is who "pressed Stop". */
  function fakeStop() {
    const state = {
      begins: [] as Array<{ scheduleId: string; creatorId: string; channelId?: string; title: string }>,
      controllers: [] as AbortController[],
      stoppedBy: undefined as string | undefined,
      finishes: 0,
    };
    const runStop: ScheduleRunStop = {
      async begin(input) {
        state.begins.push(input);
        const controller = new AbortController();
        state.controllers.push(controller);
        let done: Promise<string | undefined> | undefined;
        return {
          signal: controller.signal,
          finish() {
            done ??= (async () => {
              state.finishes += 1;
              return state.stoppedBy;
            })();
            return done;
          },
        };
      },
    };
    return { state, runStop };
  }

  function allow(channels: string[]) {
    const cfg = emptyConfig();
    cfg.discord.channels = channels;
    return cfg;
  }

  async function settled(svc: SchedulerService): Promise<void> {
    expect(await until(() => svc.runningIds().length === 0)).toBe(true);
  }

  test("a stop is not a failure: at four failures in a row a stopped run keeps the count, pauses nothing, drops its question and posts nothing", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "Flaky",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "x",
      createdByUserId: ALICE,
      channelId: CHAN,
    });
    db.run("UPDATE schedules SET consecutive_failures = ?, next_run_at = ? WHERE id = ?", [
      FAILURE_AUTO_PAUSE - 1,
      Date.now() - 1_000,
      s.id,
    ]);
    store.refresh();
    const posts: Array<{ channelId: string; content: string }> = [];
    const stop = fakeStop();
    const calls: AgentRunChatOpts[] = [];
    const svc = new SchedulerService({
      store,
      allowlist: allow([CHAN]),
      manual: true,
      useWorktrees: false,
      outbound: {
        post: async (o) => {
          posts.push(o);
        },
      },
      runStop: stop.runStop,
      agent: {
        runChat(input) {
          calls.push(input);
          return new Promise((resolveRun) => {
            input.signal?.addEventListener("abort", () =>
              resolveRun({
                ok: false,
                sessionId: input.sessionId,
                summary: "",
                exitCode: 137,
                // A question the stopped run raised is dropped.
                ask: { reason: "clarify", question: "Which branch?" },
              }),
            );
          });
        },
      },
    });
    try {
      await svc.tick();
      expect(await until(() => calls.length === 1)).toBe(true);
      expect(stop.state.begins).toEqual([
        { scheduleId: s.id, creatorId: ALICE, channelId: CHAN, title: expect.stringContaining("**Flaky**") },
      ]);
      stop.state.stoppedBy = OWNER;
      stop.state.controllers[0]!.abort();
      await settled(svc);
      const row = db
        .query("SELECT status, summary, error, ask_reason FROM schedule_runs WHERE schedule_id = ?")
        .get(s.id);
      expect(row).toEqual({
        status: "failed",
        summary: "stopped",
        error: `stopped on Discord by ${OWNER}`,
        ask_reason: null,
      });
      const sched = db
        .query("SELECT status, consecutive_failures FROM schedules WHERE id = ?")
        .get(s.id) as { status: string; consecutive_failures: number };
      expect(sched).toEqual({ status: "active", consecutive_failures: FAILURE_AUTO_PAUSE - 1 });
      expect(store.openAsk(s.id)).toBeUndefined();
      expect(posts).toEqual([]);
      expect(stop.state.finishes).toBe(1);
    } finally {
      db.close();
    }
  });

  test("a run nobody stopped finishes the control before it posts; a control that throws leaves the run going without one", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "Fine",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "x",
      createdByUserId: ALICE,
      channelId: CHAN,
    });
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1_000, s.id]);
    store.refresh();
    const events: string[] = [];
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    let throwOnBegin = false;
    const svc = new SchedulerService({
      store,
      allowlist: allow([CHAN]),
      manual: true,
      useWorktrees: false,
      outbound: {
        post: async (o) => {
          events.push(`post ${o.content.split("\n")[0]}`);
        },
      },
      runStop: {
        async begin() {
          if (throwOnBegin) throw new Error("gateway down");
          events.push("begin");
          return {
            signal: new AbortController().signal,
            async finish() {
              events.push("finish");
              return undefined;
            },
          };
        },
      },
      agent: {
        async runChat(input) {
          events.push("run");
          return { ok: true, sessionId: input.sessionId, summary: "done", exitCode: 0 };
        },
      },
    });
    try {
      await svc.tick();
      await settled(svc);
      expect(events[0]).toBe("begin");
      expect(events[1]).toBe("run");
      expect(events[2]).toBe("finish");
      expect(events[3]).toStartWith("post ✅");
      expect(runsOf(db, s.id).map((r) => r.status)).toEqual(["completed"]);

      throwOnBegin = true;
      events.length = 0;
      makeDue(db, s.id);
      store.refresh();
      await svc.tick();
      await settled(svc);
      expect(events[0]).toBe("run");
      expect(errors.some((l) => l.includes("[scheduler] stop control failed: gateway down"))).toBe(true);
      expect(runsOf(db, s.id).map((r) => r.status)).toEqual(["completed", "completed"]);
    } finally {
      console.error = origError;
      db.close();
    }
  });

  test("a run abandoned at shutdown stays recorded as abandoned even when someone also pressed Stop", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "Long",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "x",
      createdByUserId: ALICE,
      channelId: CHAN,
    });
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1_000, s.id]);
    store.refresh();
    const stop = fakeStop();
    const { agent, runs } = gatedAgent();
    const svc = new SchedulerService({
      store,
      allowlist: allow([CHAN]),
      manual: true,
      useWorktrees: false,
      runStop: stop.runStop,
      agent,
    });
    try {
      await svc.tick();
      expect(await until(() => runs.length === 1)).toBe(true);
      stop.state.stoppedBy = ALICE;
      svc.abandonInFlight("interrupted: bridge shutdown");
      expect(await svc.settleAbandoned(2_000)).toBe(true);
      expect(runsOf(db, s.id)[0]).toMatchObject({ status: "failed", error: "interrupted: bridge shutdown" });
      expect(stop.state.finishes).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe("createScheduleRunStop (AGENT-3.c)", () => {
  test("with no channel and no owner or DM it puts nothing up; a DM whose button cannot be added is deleted and its turn released", async () => {
    const control = new SessionRunControl();
    const none = createScheduleRunStop({
      runControl: control,
      outbound: () => memoryThinkingOutbound(),
      sendDm: () => undefined,
      editMessage: () => undefined,
      deleteMessage: () => undefined,
      owner: () => ({ discordId: OWNER }),
    });
    expect(await none.begin({ scheduleId: "sched_a", creatorId: OWNER, title: "t" })).toBeNull();
    const noOwner = createScheduleRunStop({
      runControl: control,
      outbound: () => memoryThinkingOutbound(),
      sendDm: () => async () => ({ channelId: "dm", messageId: "m" }),
      editMessage: () => async () => true,
      deleteMessage: () => async () => true,
      owner: () => null,
    });
    expect(await noOwner.begin({ scheduleId: "sched_a", creatorId: OWNER, title: "t" })).toBeNull();

    const deletes: string[] = [];
    const failedEdit = createScheduleRunStop({
      runControl: control,
      outbound: () => memoryThinkingOutbound(),
      sendDm: () => async () => ({ channelId: "dm", messageId: "m1" }),
      editMessage: () => async () => false,
      deleteMessage: () => async (o) => {
        deletes.push(o.messageId);
        return true;
      },
      owner: () => ({ discordId: OWNER }),
    });
    expect(await failedEdit.begin({ scheduleId: "sched_a", creatorId: OWNER, title: "t" })).toBeNull();
    expect(deletes).toEqual(["m1"]);
    expect(control.busy("schedule_sched_a")).toBe(false);
  });

  test("a channel run's handle: the stop goes through SessionRunControl.stop, finish releases the turn once and says who stopped it", async () => {
    const control = new SessionRunControl();
    const outbound = memoryThinkingOutbound();
    const stopCtl = createScheduleRunStop({
      runControl: control,
      outbound: () => outbound,
      sendDm: () => undefined,
      editMessage: () => undefined,
      deleteMessage: () => undefined,
      owner: () => ({ discordId: OWNER }),
      debounceMs: 0,
      tickMs: 60_000,
    });
    const handle = (await stopCtl.begin({ scheduleId: "sched_b", creatorId: ALICE, channelId: CHAN, title: "T" }))!;
    expect(handle).not.toBeNull();
    const progressId = outbound.sends[0]!.messageId;
    const turn = control.byProgressMessage(progressId)!;
    expect(turn).toMatchObject({ sessionId: "schedule_sched_b", requesterId: ALICE, channelId: CHAN });
    expect(stopCtl.inOwnerDm(turn.runId)).toBe(false);
    expect(control.stop(turn.runId, ALICE)).toBe("stopped");
    expect(handle.signal.aborted).toBe(true);
    expect(await handle.finish()).toBe(ALICE);
    expect(await handle.finish()).toBe(ALICE);
    expect(control.busy("schedule_sched_b")).toBe(false);
    expect(control.byProgressMessage(progressId)).toBeUndefined();
    const edit = outbound.edits.filter((e) => e.messageId === progressId).at(-1)!;
    expect(edit.components).toBeNull();
    expect((edit.embed as { description: string }).description).toBe(RUN_STOPPED_TEXT);
    expect(outbound.deletes).toEqual([]);
  });
});
