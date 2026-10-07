/**
 * AUTONOMY-6.b — "Once a session question's buttons expire, the session stops
 * waiting and my next message runs normally; a schedule's questions still
 * wait until answered." (captured from Leif's 2026-09-28 interview, round 17:
 * keep as built; REQ-discord-044 / REQ-discord-045 / REQ-discord-606).
 *
 * Both halves are pinned on the real ~30-minute window (`ASK_BUTTON_TTL_MS`,
 * DISCORD-ASK-5), not on a hand-edited expiry:
 * - a session's Choose question (chat, or a `/session start` or `/work`
 *   answer, and across a bridge restart) keeps the session waiting inside the
 *   window (a thin reply restates it), and one minute past it the same thin
 *   reply, or a new request, runs normally and nothing is left waiting;
 * - a schedule's question, one minute past that same window (and a day on),
 *   still blocks its schedule and still takes a pick, until it is answered;
 * - hi/autonomy.md holds the captured text and the docs cite it where the
 *   expiry is described.
 * Fixtures only: `startBridge` with a null gateway and an injected agent (a
 * second one on the same in-memory DB for a restart), a manual
 * `SchedulerService` on an in-memory DB, a frozen system clock; no live
 * Discord, no network, no token.
 */
import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import {
  ASK_BUTTON_TTL_MS,
  ASK_CHOICE_EXPIRED,
  ASK_STUB_HINT,
  cancelCustomId,
  openCustomId,
  pickCustomId,
} from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type ComponentInteraction, type GatewayHandlers } from "../src/discord/gateway.ts";
import type { SlashInteraction } from "../src/discord/slash-types.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "111122223333444455";
const REQUESTER_ID = "222233334444555566";
const CHAN = "chan-1";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** One minute inside, and one minute past, a session ask's ~30 minutes. */
const INSIDE = ASK_BUTTON_TTL_MS - MINUTE;
const PAST = ASK_BUTTON_TTL_MS + MINUTE;

const PICK: HumanAsk = {
  reason: "clarify",
  question: "Which database?",
  options: [
    { id: "pg", label: "Postgres" },
    { id: "lite", label: "SQLite" },
  ],
};

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  setSystemTime();
  while (cleanups.length > 0) await cleanups.pop()?.();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Freeze the clock at `ms` (Date.now / new Date). */
function clockAt(ms: number): void {
  setSystemTime(new Date(ms));
}

type Reply = { channelId: string; content: string; components?: unknown[] };
type Ephemeral = { content?: string; ephemeral?: boolean; components?: unknown[] };

type BridgeOpts = {
  /** Reuse this DB (a restart); the caller closes it. Default: a fresh in-memory DB. */
  db?: ReturnType<typeof openCorvidinhoDb>;
  /** Declare the requester team (IDENTITY-11.a: community can't start /work). */
  team?: boolean;
  /** The first chat run asks `PICK` (default); false: every run answers. */
  asks?: boolean;
};

/**
 * A bridge on an in-memory DB with an owner and one allowlisted channel.
 * Chat runs ask `PICK` first, then answer; schedule runs are never started
 * here (the scheduler is off), so a schedule ask is recorded directly.
 */
async function bridge(opts: BridgeOpts = {}) {
  const ownDb = !opts.db;
  const db = opts.db ?? openCorvidinhoDb({ memory: true });
  const allowlistFile = join(tempDir("corvidinho-expired-asks-"), "allowlist.toml");
  if (opts.team) {
    writeFileSync(allowlistFile, `[people.team1]\nrole = "team"\ndiscord_ids = ["${REQUESTER_ID}"]\n`);
  }
  const scheduleStore = new ScheduleStore({ db });
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const replies: Reply[] = [];
  const outbound = memoryThinkingOutbound();
  const prompts: string[] = [];
  let chatRuns = 0;
  const agent: AgentClient = {
    async runChat({ sessionId, prompt }) {
      prompts.push(prompt);
      chatRuns += 1;
      if (chatRuns === 1 && opts.asks !== false) {
        return {
          ok: true,
          sessionId,
          summary: "need input",
          exitCode: 0,
          ask: PICK,
          task: { verified: false, verifySkipped: true, state: "blocked" },
        };
      }
      return {
        ok: true,
        sessionId,
        summary: `ran ${chatRuns}`,
        exitCode: 0,
        task: { verified: true, verifySkipped: false, state: "done" },
      };
    },
  };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: allowlistFile,
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    },
    db,
    scheduleStore,
    projectRoot: tempDir("corvidinho-expired-asks-proj-"),
    skipProtocolCheck: true,
    disableScheduler: true,
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
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  let stopped = false;
  /** Stop this bridge (a restart's first half); the DB stays open. */
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await result.stop();
  };
  cleanups.push(async () => {
    await stop();
    if (ownDb) db.close();
  });
  const handlers = box.handlers;

  let seq = 0;
  /** The requester @mentions the bot in the channel (continues their session). */
  async function say(content: string): Promise<void> {
    seq += 1;
    await handlers.onMessage({
      id: `m${seq}`,
      channelId: CHAN,
      authorId: REQUESTER_ID,
      authorBot: false,
      content: `<@999> ${content}`,
      mentionedBot: true,
    });
  }
  /** The requester replies to the bot message `messageId` (DISCORD-2). */
  async function replyTo(messageId: string, content: string): Promise<void> {
    seq += 1;
    await handlers.onMessage({
      id: `m${seq}`,
      channelId: CHAN,
      authorId: REQUESTER_ID,
      authorBot: false,
      content,
      mentionedBot: false,
      referencedMessageId: messageId,
    });
  }
  /** The requester runs `/session start topic:<text>` or `/work description:<text>`. */
  async function slash(command: "session" | "work", text: string): Promise<void> {
    seq += 1;
    const ix: SlashInteraction = {
      id: `slash_${seq}`,
      commandName: command,
      ...(command === "session" ? { subcommand: "start" } : {}),
      channelId: CHAN,
      userId: REQUESTER_ID,
      options: command === "session" ? { topic: text } : { description: text },
      reply: async () => {},
      deferReply: async () => {},
      editReply: async () => undefined,
      deleteReply: async () => {},
    };
    await handlers.onSlash!(ix);
  }
  async function press(customId: string, userId = REQUESTER_ID): Promise<Ephemeral[]> {
    seq += 1;
    const out: Ephemeral[] = [];
    const ix: ComponentInteraction = {
      id: `ix_${seq}`,
      customId,
      channelId: CHAN,
      userId,
      messageId: `msg_${seq}`,
      reply: async (o) => {
        out.push(o);
      },
      deleteReply: async () => {},
    };
    await handlers.onComponent!(ix);
    return out;
  }
  /** A finished schedule run that stopped with `ask` at `at` (its run id). */
  function recordScheduleAsk(ask: HumanAsk, at: number): { runId: string; scheduleId: string } {
    const schedule = scheduleStore.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "summarize",
      createdByUserId: REQUESTER_ID,
      channelId: CHAN,
      now: at,
    });
    const run = scheduleStore.claimRun(schedule, at)!;
    scheduleStore.markRunFinished(schedule, run, { ok: true, summary: "state=blocked", ask }, at);
    return { runId: run.id, scheduleId: schedule.id };
  }
  /** Every message the bridge sent or edited after `from` (replies, sends, edits). */
  function postedSince(from: { replies: number; sends: number; edits: number }): string {
    return JSON.stringify([
      replies.slice(from.replies),
      outbound.sends.slice(from.sends),
      outbound.contentEdits.slice(from.edits),
    ]);
  }
  function mark() {
    return { replies: replies.length, sends: outbound.sends.length, edits: outbound.contentEdits.length };
  }
  return {
    result,
    handlers,
    replies,
    outbound,
    prompts,
    scheduleStore,
    say,
    replyTo,
    slash,
    press,
    stop,
    recordScheduleAsk,
    postedSince,
    mark,
  };
}

describe("AUTONOMY-6.b: once a session question's buttons expire, the session stops waiting", () => {
  for (const [what, next] of [
    ["a thin reply", "ok"],
    ["a new request", "never mind, what time is it?"],
  ] as const) {
    test(`inside its ~30 minutes a thin reply restates the Choose question; one minute past them ${what} runs normally and nothing is left waiting`, async () => {
      const t0 = Date.parse("2026-10-07T10:00:00Z");
      clockAt(t0);
      const b = await bridge();
      await b.say("set up storage");
      expect(b.prompts).toHaveLength(1);
      const ask = b.result.store.list()[0]!.pendingAsk!;
      expect(ask.options?.map((o) => o.label)).toEqual(["Postgres", "SQLite"]);
      // DISCORD-ASK-5: the buttons last ~30 minutes from the ask.
      expect(ask.expiresAt).toBe(t0 + ASK_BUTTON_TTL_MS);

      // Inside the window the session is still waiting: `ok` restates the
      // question with its live Choose button and runs nothing (AUTONOMY-5/6).
      clockAt(t0 + INSIDE);
      const inside = b.mark();
      await b.say("ok");
      expect(b.prompts).toHaveLength(1);
      expect(b.postedSince(inside)).toContain(openCustomId(ask.askId));
      expect(b.result.store.list()[0]!.pendingAsk?.askId).toBe(ask.askId);

      // Past the window the session stops waiting: the next message runs as
      // ordinary chat — no restated stub, no dead Choose button, no
      // prior-question block — and leaves no question open.
      clockAt(t0 + PAST);
      const past = b.mark();
      await b.say(next);
      expect(b.prompts).toHaveLength(2);
      expect(b.prompts[1]).toContain(next);
      expect(b.prompts[1]).not.toContain("Prior clarifying question");
      expect(b.postedSince(past)).not.toContain(openCustomId(ask.askId));
      expect(b.postedSince(past)).not.toContain(ASK_STUB_HINT);
      const session = b.result.store.list()[0]!;
      expect(session.pendingAsk ?? null).toBeNull();
      expect(session.openAsks).toBeUndefined();

      // Its buttons are dead (a late press runs nothing) and the session goes
      // on normally: a later thin reply runs too.
      expect(await b.press(pickCustomId(ask.askId, "pg"))).toEqual([{ content: ASK_CHOICE_EXPIRED, ephemeral: true }]);
      expect(b.prompts).toHaveLength(2);
      await b.say("ok");
      expect(b.prompts).toHaveLength(3);
      expect(b.prompts[2]).not.toContain("Prior clarifying question");
    });
  }
});

describe("AUTONOMY-6.b on the slash path: a /session start or /work question's buttons expire the same way", () => {
  for (const [command, label, text] of [
    ["session", "/session start", "storage"],
    ["work", "/work", "set up storage"],
  ] as const) {
    test(`a thin reply to a ${label} Choose answer restates it inside ~30 minutes, and runs normally one minute past them`, async () => {
      const t0 = Date.parse("2026-10-07T10:00:00Z");
      clockAt(t0);
      // IDENTITY-11.a: /work needs the requester declared team.
      const b = await bridge({ team: command === "work" });
      await b.slash(command, text);
      expect(b.prompts).toHaveLength(1);
      // The slash answer is the Choose stub (the thinking message edited in place).
      const answer = b.outbound.contentEdits.find(
        (e) => typeof e.content === "string" && e.content.includes(ASK_STUB_HINT),
      )!;
      expect(answer).toBeDefined();
      const ask = b.result.store.getByBotMessage(answer.messageId)!.pendingAsk!;
      expect(ask.expiresAt).toBe(t0 + ASK_BUTTON_TTL_MS);
      if (command === "work") expect(b.result.workStore.list()[0]!.status).toBe("blocked");

      clockAt(t0 + INSIDE);
      const inside = b.mark();
      await b.replyTo(answer.messageId, "ok");
      expect(b.prompts).toHaveLength(1);
      expect(b.postedSince(inside)).toContain(openCustomId(ask.askId));

      clockAt(t0 + PAST);
      const past = b.mark();
      await b.replyTo(answer.messageId, "ok");
      expect(b.prompts).toHaveLength(2);
      expect(b.prompts[1]).not.toContain("Prior clarifying question");
      expect(b.postedSince(past)).not.toContain(openCustomId(ask.askId));
      const session = b.result.store.getByBotMessage(answer.messageId)!;
      expect(session.pendingAsk ?? null).toBeNull();
      expect(session.openAsks).toBeUndefined();
    });
  }
});

describe("AUTONOMY-6.b across a bridge restart: the stored ask keeps its ~30 minutes", () => {
  test("after a restart a thin reply still restates the ask inside its window, and one minute past it the next message runs", async () => {
    const t0 = Date.parse("2026-10-07T10:00:00Z");
    clockAt(t0);
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const first = await bridge({ db });
    await first.say("set up storage");
    const ask = first.result.store.list()[0]!.pendingAsk!;
    expect(ask.expiresAt).toBe(t0 + ASK_BUTTON_TTL_MS);
    await first.stop();

    // A new bridge on the same DB loads the session with its open ask
    // (`discord_sessions.pending_ask`) and its expiry.
    clockAt(t0 + INSIDE);
    const b = await bridge({ db, asks: false });
    expect(b.result.store.list()[0]!.pendingAsk?.askId).toBe(ask.askId);
    const inside = b.mark();
    await b.say("ok");
    expect(b.prompts).toHaveLength(0);
    expect(b.postedSince(inside)).toContain(openCustomId(ask.askId));

    clockAt(t0 + PAST);
    const past = b.mark();
    await b.say("ok");
    expect(b.prompts).toHaveLength(1);
    expect(b.prompts[0]).not.toContain("Prior clarifying question");
    expect(b.postedSince(past)).not.toContain(openCustomId(ask.askId));
    expect(b.result.store.list()[0]!.pendingAsk ?? null).toBeNull();
    expect(await b.press(pickCustomId(ask.askId, "pg"))).toEqual([{ content: ASK_CHOICE_EXPIRED, ephemeral: true }]);
    expect(b.prompts).toHaveLength(1);
  });
});

describe("AUTONOMY-6.b: a schedule's questions still wait until answered", () => {
  test("one minute past a session ask's ~30 minutes, the session's Choose is expired while the schedule's Choose still opens and takes a pick", async () => {
    const t0 = Date.parse("2026-10-07T10:00:00Z");
    clockAt(t0);
    const b = await bridge();
    await b.say("set up storage");
    const sessionAsk = b.result.store.list()[0]!.pendingAsk!;
    const sched = b.recordScheduleAsk(PICK, t0);

    clockAt(t0 + PAST);
    // The session's question lapsed with its buttons (REQ-discord-045).
    expect(await b.press(openCustomId(sessionAsk.askId))).toEqual([{ content: ASK_CHOICE_EXPIRED, ephemeral: true }]);
    // A message from the schedule's creator in its channel is session chat:
    // it runs, and it never closes the schedule's question.
    await b.say("ok");
    expect(b.prompts).toHaveLength(2);
    expect(b.scheduleStore.openAsk(sched.scheduleId)?.runId).toBe(sched.runId);

    // The schedule's question is still open: its Choose opens the choices
    // (never "that choice expired") and a pick answers it.
    const opened = await b.press(openCustomId(sched.runId));
    expect(opened).toHaveLength(1);
    expect(opened[0]!.content).toContain("Which database?");
    expect(JSON.stringify(opened[0]!.components)).toContain(pickCustomId(sched.runId, "pg"));
    const picked = await b.press(pickCustomId(sched.runId, "pg"));
    expect(picked[0]!.content).toContain("**Postgres**");
    expect(b.scheduleStore.openAsk(sched.scheduleId)).toBeUndefined();
    expect(b.scheduleStore.answeredAsk(sched.scheduleId)).toMatchObject({ answer: "Postgres", outcome: "picked" });
  });

  test("the schedule's due runs keep waiting one minute past the ~30 minutes and a day on, with one note, until the question is answered", async () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const clock = { now: Date.parse("2026-10-07T10:00:00Z") };
    const store = new ScheduleStore({ db });
    // Every 5 minutes, so a run comes due just past the session asks' window.
    const schedule = store.create({
      name: "Nightly",
      cronExpression: "*/5 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: REQUESTER_ID,
      channelId: CHAN,
      now: clock.now,
    });
    const prompts: string[] = [];
    let asking = true;
    const agent: AgentClient = {
      async runChat({ sessionId, prompt }) {
        prompts.push(prompt);
        if (asking) return { ok: true, sessionId, summary: "state=blocked", exitCode: 0, ask: PICK };
        return { ok: true, sessionId, summary: "done", exitCode: 0 };
      },
    };
    const allowlist = emptyConfig();
    allowlist.discord.channels = [CHAN];
    const posts: Array<{ content: string; components?: unknown[] }> = [];
    const svc = new SchedulerService({
      store,
      agent,
      allowlist,
      manual: true,
      useWorktrees: false,
      owner: { discordId: OWNER_ID, display: "Leif" },
      now: () => clock.now,
      outbound: {
        post: async (p) => void posts.push(p),
        dm: async () => true,
      },
    });
    /** Both clocks (the injected one and the system one) at `ms`, then a tick. */
    async function tickAt(ms: number) {
      clock.now = ms;
      clockAt(ms);
      const r = await svc.tick();
      for (let i = 0; i < 200 && svc.runningIds().length > 0; i++) await Bun.sleep(5);
      expect(svc.runningIds()).toEqual([]);
      await svc.settleAskDelivery();
      return r;
    }

    // 10:05 — the run asks; its post carries Choose + Cancel.
    const askedAt = Date.parse("2026-10-07T10:05:00Z");
    expect((await tickAt(askedAt)).started).toEqual([schedule.id]);
    const runId = store.openAsk(schedule.id)!.runId;
    expect(posts).toHaveLength(1);
    expect(JSON.stringify(posts[0]!.components)).toContain(openCustomId(runId));
    expect(JSON.stringify(posts[0]!.components)).toContain(cancelCustomId(runId));

    // One minute past the window a session ask's buttons would have: the
    // schedule's due run is skipped, nothing runs, the question stays open,
    // and one wait note goes out.
    asking = false;
    expect(await tickAt(askedAt + PAST)).toEqual({ started: [], skipped: [schedule.id] });
    expect(prompts).toHaveLength(1);
    expect(store.openAsk(schedule.id)?.runId).toBe(runId);
    expect(posts).toHaveLength(2);
    expect(posts[1]!.content).toContain("waiting");

    // A day on: still waiting, no second note.
    expect(await tickAt(askedAt + DAY + PAST)).toEqual({ started: [], skipped: [schedule.id] });
    expect(prompts).toHaveLength(1);
    expect(store.openAsk(schedule.id)?.runId).toBe(runId);
    expect(posts).toHaveLength(2);

    // Answered (the owner's pick): the next due run goes ahead with it.
    expect(store.closeRunAsk(runId, { outcome: "picked", answer: "SQLite", closedBy: OWNER_ID })).toBe(true);
    expect((await tickAt(askedAt + DAY + PAST + 5 * MINUTE)).started).toEqual([schedule.id]);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("SQLite");
  });
});

describe("AUTONOMY-6.b is captured and the docs say it where the expiry is described", () => {
  const root = join(import.meta.dir, "..");
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");
  const CAPTURED =
    "Once a session question's buttons expire, the session stops waiting and my next message runs normally; a schedule's questions still wait until answered.";

  test("hi/autonomy.md holds Leif's text under AUTONOMY-6", () => {
    const hi = read("hi/autonomy.md");
    expect(hi).toContain(`**AUTONOMY-6.b**  ${CAPTURED}`);
    expect(hi.indexOf("**AUTONOMY-6.b**")).toBeGreaterThan(hi.indexOf("**AUTONOMY-6.a**"));
  });

  test("docs/discord.md cites AUTONOMY-6.b at the ~30-minute expiry, the thin-reply rule and the schedule exception; DISCORD-GO-LIVE.md too", () => {
    const doc = read("docs/discord.md");
    expect(doc).toContain(
      "Buttons expire after ~30 minutes; once a session question's buttons expire, the session stops waiting on it and your next message runs normally (AUTONOMY-6.b, below), while a schedule's question still waits until it is answered.",
    );
    expect(doc).toContain(
      "Once a session question's buttons expire (~30 minutes), the session stops waiting on it and your next message runs normally (AUTONOMY-6.b, REQ-discord-044)",
    );
    expect(doc).toContain(
      "DISCORD-ASK-5's ~30-minute expiry applies to chat and slash asks only (AUTONOMY-6.b: once a session question's buttons expire the session stops waiting, but a schedule's questions still wait until answered).",
    );
    const goLive = read("docs/DISCORD-GO-LIVE.md");
    expect(goLive).toContain("A chat or slash question is different (AUTONOMY-6.b)");
  });
});
