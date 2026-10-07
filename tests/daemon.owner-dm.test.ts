/**
 * AUTONOMOUS-7.a (REQ-discord-707 / REQ-cli-707): "With only the daemon
 * running and no bridge, a scheduled run's question still reaches me by DM."
 *
 * A ticker that cannot post but has the owner DM (`ownerDm`, what
 * `corvidinho daemon` wires with a bot token) DMs each pending schedule ask
 * to the owner while no Discord bridge runs on its data dir, and takes it
 * (`ask_posted_at`, the delivered marker), so a bridge that starts later never
 * sends it again. Fixtures only: in-memory / temp SQLite, injected agents, a
 * fake Discord REST client and a null gateway; no live Discord, no network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatAskSummary, stuckAfterVerifyAsk } from "../src/agent/ask.ts";
import { SPEND_CAP_SUMMARY, spendCapReachedAsk } from "../src/agent/spend-notice.ts";
import { createSpendAlertOutbox } from "../src/agent/spend-outbox.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createDaemonLogger, startDaemon } from "../src/daemon/index.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway } from "../src/discord/gateway.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore, type Schedule } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "111122223333444455";
const OWNER: OwnerRecord = { discordId: OWNER_ID, display: "Leif" };
const CREATOR_ID = "222233334444555566";
const CHANNEL = "333344445555666677";
const DM_CHANNEL = "900000000000000001";
const HOUR = 3_600_000;
const STUCK: HumanAsk = stuckAfterVerifyAsk(2);
const CLARIFY: HumanAsk = { reason: "clarify", question: "Postgres or SQLite?" };
const CAP_ASK: HumanAsk = spendCapReachedAsk({
  spentMicroUsd: 4_999_000,
  estimateMicroUsd: 2_600,
  capMicroUsd: 5_000_000,
});
/** The note that closes every daemon DM (src/discord/schedule-ask.ts). */
const NOTE_HEAD = "📭 Sent by `corvidinho daemon`: no Discord bridge is running, so this can't be answered yet.";
const RETRY_MS = 5 * 60_000;

type Step = HumanAsk | "ok";
type Dm = { userId: string; content: string };
type LogLine = { level: string; event: string; fields: Record<string, unknown> };

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function stepAgent(steps: { next: Step }): AgentClient {
  return {
    async runChat({ sessionId }) {
      const step = steps.next;
      if (step === "ok") return { ok: true, sessionId, summary: "done", exitCode: 0 };
      if (step.reason === "spend-cap") {
        return { ok: true, sessionId, summary: SPEND_CAP_SUMMARY, exitCode: 0, ask: step };
      }
      const ok = step.reason === "clarify";
      return {
        ok,
        sessionId,
        summary: `state=${ok ? "blocked" : "failed"}\n${formatAskSummary(step)}`,
        exitCode: ok ? 0 : 1,
        ask: step,
      };
    },
  };
}

function allow(channels: string[]) {
  const cfg = emptyConfig();
  cfg.discord.channels = channels;
  return cfg;
}

async function runsSettled(svc: SchedulerService): Promise<void> {
  for (let i = 0; i < 200 && svc.runningIds().length > 0; i++) await Bun.sleep(5);
  expect(svc.runningIds()).toEqual([]);
}

type AskRow = { ask_reason: string | null; ask_posted_at: number | null };

function lastRow(db: Database, scheduleId: string): AskRow {
  return db
    .query(
      `SELECT ask_reason, ask_posted_at FROM schedule_runs
       WHERE schedule_id = ? ORDER BY rowid DESC LIMIT 1`,
    )
    .get(scheduleId) as AskRow;
}

/**
 * A daemon-wired scheduler (no outbound) with the owner DM, on one DB, plus
 * what its DM sender and logger saw. `bridge.live` is the `bridgeLive` answer.
 */
function daemonWithDm(
  opts: {
    channelId?: string | null;
    owner?: OwnerRecord | null;
    send?: ((o: Dm) => Promise<{ channelId: string; messageId: string } | null>) | null;
    spendAlerts?: boolean;
    name?: string;
  } = {},
) {
  const db = openCorvidinhoDb({ memory: true });
  cleanups.push(() => db.close());
  const clock = { now: Date.parse("2026-10-07T10:30:00Z") };
  const store = new ScheduleStore({ db });
  const make = (name: string): Schedule =>
    store.create({
      name,
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: CREATOR_ID,
      ...(opts.channelId === undefined ? { channelId: CHANNEL } : opts.channelId ? { channelId: opts.channelId } : {}),
      now: clock.now,
    });
  const schedule = make(opts.name ?? "Nightly");
  const steps: { next: Step } = { next: "ok" };
  const dms: Dm[] = [];
  const logs: LogLine[] = [];
  const bridge = { live: false as boolean | "throw" };
  const allowlist = allow([CHANNEL]);
  const send =
    opts.send === null
      ? undefined
      : opts.send ??
        (async (o: Dm) => {
          dms.push(o);
          return { channelId: DM_CHANNEL, messageId: `m${dms.length}` };
        });
  const svc = new SchedulerService({
    store,
    agent: stepAgent(steps),
    allowlist,
    manual: true,
    useWorktrees: false,
    owner: opts.owner === undefined ? OWNER : opts.owner,
    now: () => clock.now,
    ownerDm: {
      ...(send ? { send } : {}),
      bridgeLive: () => {
        if (bridge.live === "throw") throw new Error("schema_meta locked");
        return bridge.live;
      },
      ...(opts.spendAlerts ? { spendAlerts: createSpendAlertOutbox({ db, now: () => clock.now }) } : {}),
      log: (level, event, fields) => logs.push({ level, event, fields }),
      retryMs: RETRY_MS,
    },
  });
  /** The next due run of `s` ends as `step`; its ask DM (if any) has settled. */
  async function run(step: Step, s: Schedule = schedule): Promise<void> {
    steps.next = step;
    clock.now += HOUR;
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [clock.now - 1000, s.id]);
    expect((await svc.tick()).started).toContain(s.id);
    await runsSettled(svc);
    await svc.settleAskDelivery();
  }
  /** A tick with nothing due (the 60 s poll); its delivery pass has settled. */
  async function tick(): Promise<void> {
    await svc.tick();
    await svc.settleAskDelivery();
  }
  return { db, clock, store, schedule, make, steps, dms, logs, bridge, allowlist, svc, run, tick };
}

function events(logs: LogLine[], event: string): LogLine[] {
  return logs.filter((l) => l.event === event);
}

describe("the daemon's owner DM pass (SchedulerService ownerDm, AUTONOMOUS-7.a, REQ-discord-707)", () => {
  test("a stuck run's question reaches the owner by DM once, with no mention or controls; the ask is taken so a bridge never sends it again", async () => {
    const t = daemonWithDm();
    await t.run(STUCK);
    expect(t.dms).toHaveLength(1);
    const dm = t.dms[0]!;
    expect(dm.userId).toBe(OWNER_ID);
    expect(dm.content.startsWith(`Schedule **Nightly** (\`${t.schedule.id.slice(0, 12)}\`) on \`proj-a\`:\n`)).toBe(true);
    expect(dm.content).toContain("⚠️ I'm stuck and need a human.\n");
    expect(dm.content).toContain(`> ${STUCK.question}`);
    // The DM notifies by itself: nobody is mentioned.
    expect(dm.content).not.toContain("<@");
    expect(dm.content).toContain(NOTE_HEAD);
    expect(dm.content).toContain(`its controls in <#${CHANNEL}> when its next run comes due.`);
    expect(dm.content.length).toBeLessThanOrEqual(1900);
    // The delivered marker is the ask row's own: taken, still open.
    expect(lastRow(t.db, t.schedule.id).ask_posted_at).toBe(t.clock.now);
    expect(t.store.pendingAsks()).toEqual([]);
    expect(t.store.openAsk(t.schedule.id)?.runId).toBeDefined();
    expect(events(t.logs, "schedule_ask.dm_sent")).toEqual([
      {
        level: "info",
        event: "schedule_ask.dm_sent",
        fields: { scheduleId: t.schedule.id, runId: t.store.openAsk(t.schedule.id)!.runId, reason: "stuck" },
      },
    ]);

    // Later polls send nothing more.
    await t.tick();
    await t.tick();
    expect(t.dms).toHaveLength(1);

    // A bridge-wired ticker on the same DB finds nothing to post.
    const posts: unknown[] = [];
    const bridge = new SchedulerService({
      store: new ScheduleStore({ db: t.db }),
      agent: stepAgent({ next: "ok" }),
      allowlist: allow([CHANNEL]),
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      now: () => t.clock.now,
      outbound: {
        post: async (p) => void posts.push(p),
        dm: async (p) => {
          posts.push(p);
          return true;
        },
      },
    });
    await bridge.tick();
    await bridge.settleAskDelivery();
    expect(posts).toEqual([]);
  });

  test("a clarify question of a schedule with no channel is DMed to the owner, pinging nobody; the note says its controls come here", async () => {
    const t = daemonWithDm({ channelId: null });
    await t.run(CLARIFY);
    expect(t.dms).toHaveLength(1);
    expect(t.dms[0]!.content).toContain("❓ I need your input before I can continue.\n> Postgres or SQLite?");
    expect(t.dms[0]!.content).not.toContain("<@");
    expect(t.dms[0]!.content).toContain("its controls here when its next run comes due.");
    // The schedule keeps waiting on it (AUTONOMY-6.a): the next due run is skipped.
    t.clock.now += HOUR;
    t.db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [t.clock.now - 1000, t.schedule.id]);
    expect((await t.svc.tick()).skipped).toEqual([t.schedule.id]);
    await t.svc.settleAskDelivery();
    expect(t.dms).toHaveLength(1);
  });

  test("while a bridge runs on the data dir nothing is DMed and the ask stays pending for it; once it is gone the next tick DMs it", async () => {
    const t = daemonWithDm();
    t.bridge.live = true;
    await t.run(STUCK);
    await t.tick();
    expect(t.dms).toEqual([]);
    expect(lastRow(t.db, t.schedule.id)).toEqual({ ask_reason: "stuck", ask_posted_at: null });
    expect(t.store.pendingAsks()).toHaveLength(1);

    // A liveness check that throws counts as live (fail closed: no DM).
    t.bridge.live = "throw";
    await t.tick();
    expect(t.dms).toEqual([]);

    t.bridge.live = false;
    await t.tick();
    expect(t.dms).toHaveLength(1);
    expect(lastRow(t.db, t.schedule.id).ask_posted_at).not.toBeNull();
  });

  test("no bot token: nothing is taken, one log line says why, and the ask keeps waiting for a bridge", async () => {
    const t = daemonWithDm({ send: null });
    await t.run(STUCK);
    await t.tick();
    await t.tick();
    expect(lastRow(t.db, t.schedule.id)).toEqual({ ask_reason: "stuck", ask_posted_at: null });
    const lines = events(t.logs, "schedule_ask.dm_unavailable");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.level).toBe("warn");
    expect(lines[0]!.fields.reason).toBe("no-token");
    expect(String(lines[0]!.fields.message)).toContain("DISCORD_TOKEN");
  });

  test("no owner configured: nothing is DMed or taken, one log line says why, and the ask keeps waiting", async () => {
    const t = daemonWithDm({ owner: null });
    await t.run(STUCK);
    await t.tick();
    expect(t.dms).toEqual([]);
    expect(lastRow(t.db, t.schedule.id).ask_posted_at).toBeNull();
    const lines = events(t.logs, "schedule_ask.dm_unavailable");
    expect(lines.map((l) => l.fields.reason)).toEqual(["no-owner"]);
  });

  test("a DM that does not go out hands the ask back and is retried after the retry wait, not every tick", async () => {
    const outcomes: Array<"fail" | "throw" | "ok"> = ["fail", "throw", "ok"];
    const sent: Dm[] = [];
    const t = daemonWithDm({
      send: async (o) => {
        const next = outcomes.shift();
        if (next === "throw") throw new Error("Discord 50007: Cannot send messages to this user");
        if (next === "fail") return null;
        sent.push(o);
        return { channelId: DM_CHANNEL, messageId: "m1" };
      },
    });
    await t.run(STUCK);
    expect(lastRow(t.db, t.schedule.id).ask_posted_at).toBeNull();
    expect(events(t.logs, "schedule_ask.dm_failed")).toHaveLength(1);
    expect(events(t.logs, "schedule_ask.dm_failed")[0]!.fields.retryInMinutes).toBe(5);

    // Within the wait: not tried again.
    t.clock.now += RETRY_MS - 1;
    await t.tick();
    expect(outcomes).toEqual(["throw", "ok"]);

    // After it: tried (throws: handed back, logged), then after the next wait sent once.
    t.clock.now += 1;
    await t.tick();
    expect(outcomes).toEqual(["ok"]);
    expect(lastRow(t.db, t.schedule.id).ask_posted_at).toBeNull();
    t.clock.now += RETRY_MS;
    await t.tick();
    expect(sent).toHaveLength(1);
    expect(lastRow(t.db, t.schedule.id).ask_posted_at).not.toBeNull();
    expect(events(t.logs, "schedule_ask.dm_failed")).toHaveLength(2);
    expect(events(t.logs, "schedule_ask.dm_sent")).toHaveLength(1);
  });

  test("a creator or channel the live allowlist refuses gets no DM and the ask stays pending until it passes again (DISCORD-SCHEDULE-3)", async () => {
    const t = daemonWithDm();
    t.bridge.live = true;
    await t.run(STUCK);
    // `/admin` drops the channel (the shared allowlist edited in place).
    t.allowlist.discord.channels = [];
    t.bridge.live = false;
    await t.tick();
    expect(t.dms).toEqual([]);
    expect(lastRow(t.db, t.schedule.id).ask_posted_at).toBeNull();
    t.allowlist.discord.channels = [CHANNEL];
    await t.tick();
    expect(t.dms).toHaveLength(1);
  });

  test("the question is scrubbed, defanged and quoted (SAFE-6); a run's summary rides only as stuck context, scrubbed too", async () => {
    const secret = "ghp_" + "a1B2c3D4e5F6g7H8i9J0".repeat(2).slice(0, 36);
    const t = daemonWithDm({ name: "Ping @everyone" });
    await t.run({ reason: "stuck", question: `Token ${secret} was rejected. Tell @here?\nRetry?` });
    expect(t.dms).toHaveLength(1);
    const content = t.dms[0]!.content;
    expect(content).not.toContain(secret);
    expect(content).toContain("[redacted");
    expect(content).not.toMatch(/@(everyone|here)\b/);
    expect(content).toContain("@​everyone");
    expect(content).toContain("> Retry?");
  });

  test("a spend-cap stop DMs its details once per cap episode (SAFE-14.a); a second stop in the same episode gets the headline alone", async () => {
    const t = daemonWithDm({ spendAlerts: true });
    await t.run(CAP_ASK);
    expect(t.dms).toHaveLength(1);
    const first = t.dms[0]!.content;
    expect(first).toContain("💸 Work is paused for budget. Only you see these details (SAFE-14.a).");
    expect(first).toContain(`In <#${CHANNEL}>:`);
    expect(first).toContain("> Daily spend cap reached");
    expect(first).toContain(NOTE_HEAD);

    const other = t.make("Hourly");
    await t.run(CAP_ASK, other);
    expect(t.dms).toHaveLength(2);
    const second = t.dms[1]!.content;
    expect(second).toContain(`Schedule **Hourly**`);
    expect(second).toContain("💸 Work is paused for budget.");
    expect(second).not.toContain("Only you see these details");
    expect(second).not.toContain("Daily spend cap reached");
    expect(second).toContain(NOTE_HEAD);
  });

  test("a stop that outlasts a DM in flight hands its ask back; the DM then going out takes it again", async () => {
    let finish!: (v: { channelId: string; messageId: string } | null) => void;
    const t = daemonWithDm({
      send: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    t.steps.next = STUCK;
    t.clock.now += HOUR;
    t.db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [t.clock.now - 1000, t.schedule.id]);
    await t.svc.tick();
    await runsSettled(t.svc);
    for (let i = 0; i < 100 && !finish; i++) await Bun.sleep(5);
    expect(lastRow(t.db, t.schedule.id).ask_posted_at).not.toBeNull();
    t.svc.stop();
    expect(await t.svc.settleAskDelivery(20)).toBe(false);
    expect(lastRow(t.db, t.schedule.id).ask_posted_at).toBeNull();
    finish({ channelId: DM_CHANNEL, messageId: "m1" });
    await t.svc.settleAskDelivery();
    expect(lastRow(t.db, t.schedule.id).ask_posted_at).not.toBeNull();
  });
});

describe("`corvidinho daemon` with no bridge DMs the owner over Discord's REST API (AUTONOMOUS-7.a, REQ-cli-707)", () => {
  type Call = { route: string; body: Record<string, unknown> };
  function fakeRest(): { rest: { post(route: `/${string}`, o: { body: unknown }): Promise<unknown> }; calls: Call[] } {
    const calls: Call[] = [];
    return {
      calls,
      rest: {
        async post(route, { body }) {
          calls.push({ route, body: body as Record<string, unknown> });
          if (route === "/users/@me/channels") return { id: DM_CHANNEL, type: 1 };
          return { id: `80000000000000000${calls.length}`, channel_id: DM_CHANNEL };
        },
      },
    };
  }

  function tempEnv(extra: Record<string, string>) {
    const dataDir = mkdtempSync(join(tmpdir(), "corvidinho-owner-dm-"));
    const projectRoot = mkdtempSync(join(tmpdir(), "corvidinho-owner-dm-proj-"));
    cleanups.push(() => {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
    });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CORVIDINHO_DATA_DIR: dataDir,
      CORVIDINHO_ALLOWLIST_FILE: join(dataDir, "none.toml"),
      DISCORD_CHANNEL_IDS: CHANNEL,
      ...extra,
    };
    const seed = openCorvidinhoDb({ env });
    const s = new ScheduleStore({ db: seed }).create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "summarize",
      createdByUserId: CREATOR_ID,
      channelId: CHANNEL,
    });
    seed.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    seed.close();
    return { dataDir, projectRoot, env, schedule: s };
  }

  test("a stuck run's question goes to the owner by DM (no gateway); a bridge started later sends it nowhere again, and its wait note brings the controls", async () => {
    const { dataDir, projectRoot, env, schedule } = tempEnv({
      DISCORD_BOT_TOKEN: "fake-bot-token",
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    });
    const { rest, calls } = fakeRest();
    const lines: Array<Record<string, unknown>> = [];
    const d = await startDaemon({
      env,
      projectRoot,
      logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
      agent: stepAgent({ next: STUCK }),
      useWorktrees: false,
      discordRest: rest,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    try {
      expect(lines.find((l) => l.event === "daemon.started")?.ownerDm).toBe("on");
      await d.tick();
      await runsSettled(d.scheduler);
      await d.scheduler.settleAskDelivery();
    } finally {
      await d.stop("SIGTERM");
    }
    expect(lines.find((l) => l.event === "run.needs_human")).toMatchObject({ reason: "stuck" });
    expect(lines.find((l) => l.event === "schedule_ask.dm_sent")).toMatchObject({
      level: "info",
      scheduleId: schedule.id,
      reason: "stuck",
    });
    expect(calls.map((c) => c.route)).toEqual(["/users/@me/channels", `/channels/${DM_CHANNEL}/messages`]);
    expect(calls[0]!.body).toEqual({ recipient_id: OWNER_ID });
    const msg = calls[1]!.body as { content: string; allowed_mentions: unknown; components?: unknown };
    expect(msg.allowed_mentions).toEqual({ parse: [] });
    expect(msg.components).toBeUndefined();
    expect(msg.content).toContain("⚠️ I'm stuck and need a human.");
    expect(msg.content).toContain(`> ${STUCK.question}`);
    expect(msg.content).toContain(NOTE_HEAD);
    expect(JSON.stringify(lines)).not.toContain("fake-bot-token");

    // The schedule's next run comes due while it waits on the question.
    const db = openCorvidinhoDb({ env });
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, schedule.id]);
    const replies: Array<{ channelId: string; content: string; components?: unknown[] }> = [];
    const dms: Array<{ userId: string; content: string }> = [];
    const outbound = memoryThinkingOutbound();
    const bridge = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: CHANNEL,
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
        CORVIDINHO_ALLOWLIST_FILE: join(dataDir, "none.toml"),
        CORVIDINHO_DATA_DIR: dataDir,
      },
      db,
      projectRoot,
      skipProtocolCheck: true,
      schedulerPollIntervalMs: 20,
      thinkingOutbound: { sendEmbed: outbound.sendEmbed, editEmbed: outbound.editEmbed },
      agent: stepAgent({ next: "ok" }),
      gatewayFactory: async (_cfg, handlers) => {
        handlers.reply = async (o) => {
          replies.push(o);
          return { messageId: `bot_${replies.length}` };
        };
        handlers.sendDm = async (o) => {
          dms.push(o);
          return { channelId: DM_CHANNEL, messageId: `dm_${dms.length}` };
        };
        return createNullGateway();
      },
    });
    expect(bridge.ok).toBe(true);
    if (!bridge.ok) return;
    try {
      for (let i = 0; i < 150 && replies.length === 0; i++) await Bun.sleep(20);
      await Bun.sleep(100);
      // Only the wait note, with the question's controls; the question is not sent again.
      expect(replies).toHaveLength(1);
      expect(replies[0]!.channelId).toBe(CHANNEL);
      expect(replies[0]!.content).toContain("its next runs are waiting until its last question is answered or cancelled");
      expect(replies[0]!.content).not.toContain("I'm stuck");
      expect(JSON.stringify(replies[0]!.components)).toContain("Cancel");
      expect(dms).toEqual([]);
    } finally {
      await bridge.stop();
      db.close();
    }
  });

  test("with no bot token the daemon says so once and the question waits for a bridge, as before", async () => {
    const { projectRoot, env, schedule } = tempEnv({ CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID });
    delete env.DISCORD_BOT_TOKEN;
    delete env.DISCORD_TOKEN;
    const { rest, calls } = fakeRest();
    const lines: Array<Record<string, unknown>> = [];
    const d = await startDaemon({
      env,
      projectRoot,
      logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
      agent: stepAgent({ next: STUCK }),
      useWorktrees: false,
      discordRest: rest,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    try {
      expect(lines.find((l) => l.event === "daemon.started")?.ownerDm).toBe("no-token");
      await d.tick();
      await runsSettled(d.scheduler);
      await d.scheduler.settleAskDelivery();
      await d.tick();
      await d.scheduler.settleAskDelivery();
    } finally {
      await d.stop("SIGTERM");
    }
    expect(calls).toEqual([]);
    expect(lines.filter((l) => l.event === "schedule_ask.dm_unavailable")).toEqual([
      expect.objectContaining({ level: "warn", reason: "no-token" }),
    ]);
    const db = openCorvidinhoDb({ env });
    try {
      expect(lastRow(db, schedule.id)).toEqual({ ask_reason: "stuck", ask_posted_at: null });
    } finally {
      db.close();
    }
  });
});
