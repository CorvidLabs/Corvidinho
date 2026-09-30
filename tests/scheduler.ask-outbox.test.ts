/**
 * REQ-discord-347 — needs-human outbox for schedule runs (AUTONOMY-2 /
 * AUTONOMOUS-7, #97 #104). A schedule run `corvidinho daemon` claims has no
 * Discord: when it stops to ask a human (stuck, clarify, spend cap) the ask
 * is recorded on its run row, and the bridge's next scheduler tick posts it
 * to the schedule's channel once, with the same pings as a run the bridge
 * claimed (owner for stuck / spend-cap, schedule creator for clarify;
 * AUTONOMY-4, SAFE-8). Fixtures only: in-memory / temp SQLite, injected
 * agents, a null gateway; no live Discord, no network, no git worktrees.
 *
 * AUTONOMY-6.a (REQ-discord-606): every recorded ask now blocks its schedule
 * until the creator or the owner answers or cancels it, so a test that runs
 * the schedule again after an ask first cancels it (`cancelAsk`, what the
 * Cancel button does); tests/scheduler.ask-block.test.ts covers the waiting.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database as SqliteDatabase, type Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ASK_QUESTION_MAX,
  askFromUnknown,
  formatAskSummary,
  stuckAfterVerifyAsk,
} from "../src/agent/ask.ts";
import { SPEND_CAP_ENV, SpendLedger } from "../src/agent/spend.ts";
import { SPEND_CAP_SUMMARY, spendCapReachedAsk } from "../src/agent/spend-notice.ts";
import { createSpendAlertOutbox, type SpendAlertOutbox } from "../src/agent/spend-outbox.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createDaemonLogger, startDaemon } from "../src/daemon/index.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { ASK_REPLY_HINT, askPingKey, SPEND_CAP_HEADLINE } from "../src/discord/ask-ping.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway } from "../src/discord/gateway.ts";
import { createSpendDm } from "../src/discord/spend-dm.ts";
import {
  autoPauseAsk,
  FAILURE_AUTO_PAUSE,
  PROJECT_RESOLVE_FAILED_QUESTION,
  SchedulerService,
  WORKTREE_FAILED_QUESTION,
  type ScheduleRunFinished,
} from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { migrateCorvidinhoDb, openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";

const OWNER_ID = "111122223333444455";
const OWNER = { discordId: OWNER_ID, display: "Leif" };
const CREATOR_ID = "222233334444555566";
const CHANNEL = "chan-allowed";
const HOUR = 3_600_000;
/** What a spawn that throws says (it names a host path). */
const SPAWN_ERROR = "spawn /opt/host-only/bin/corvidinho ENOENT";
const STUCK: HumanAsk = stuckAfterVerifyAsk(2);
const CLARIFY: HumanAsk = { reason: "clarify", question: "Postgres or SQLite?" };
const CAP_ASK: HumanAsk = spendCapReachedAsk({
  spentMicroUsd: 4_999_000,
  estimateMicroUsd: 2_600,
  capMicroUsd: 5_000_000,
});

type Step = HumanAsk | "ok" | "fail" | "throw";
type Post = { channelId: string; content: string; mentionUserIds?: string[] };

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** Agent whose next run ends as `steps.next` (the task run's result shapes). */
function stepAgent(steps: { next: Step; calls?: number; prompt?: string }): AgentClient {
  return {
    async runChat({ sessionId, prompt }) {
      steps.calls = (steps.calls ?? 0) + 1;
      steps.prompt = prompt;
      const step = steps.next;
      if (step === "ok") return { ok: true, sessionId, summary: "done", exitCode: 0 };
      if (step === "fail") return { ok: false, sessionId, summary: "boom", exitCode: 1 };
      if (step === "throw") throw new Error(SPAWN_ERROR);
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
  // A schedule's project nested in the bridge root needs an allowlisted
  // origin (DISCORD-SCHEDULE-3.a); the worktree tests give theirs one.
  cfg.github.orgs = ["corvidlabs"];
  return cfg;
}

async function runsSettled(svc: SchedulerService): Promise<void> {
  for (let i = 0; i < 200 && svc.runningIds().length > 0; i++) await Bun.sleep(5);
  expect(svc.runningIds()).toEqual([]);
}

type RunRow = {
  status: string;
  summary: string | null;
  error?: string | null;
  ask_reason: string | null;
  ask_question: string | null;
  ask_posted_at: number | null;
};

/**
 * The documented pairing (CLI-8 / AUTONOMOUS-4): a daemon-wired scheduler
 * (no owner, no outbound, like src/daemon/daemon.ts) and a bridge-wired one
 * (owner + outbound, like src/discord/bridge.ts) on one DB.
 */
function pair(
  opts: {
    db?: Database;
    bridgeChannels?: string[];
    bridgeAllowlist?: ReturnType<typeof allow>;
    post?: (p: Post) => Promise<void | boolean>;
    spendAlerts?: SpendAlertOutbox;
    /** SAFE-14.a: the bridge's owner DM pass (records what it is handed). */
    spendDm?: { deliver(o?: { stop?: { ask: HumanAsk; channelId?: string }; warning?: unknown }): Promise<unknown> };
    /** Run in worktrees under this root (REQ-discord-353 pre-run failures). */
    projectRoot?: string;
    project?: string;
  } = {},
) {
  const db = opts.db ?? openCorvidinhoDb({ memory: true });
  cleanups.push(() => db.close());
  const clock = { now: Date.parse("2026-09-27T10:30:00Z") };
  const setup = new ScheduleStore({ db });
  const schedule = setup.create({
    name: "Nightly",
    cronExpression: "0 * * * *",
    project: opts.project ?? "proj-a",
    prompt: "do thing",
    createdByUserId: CREATOR_ID,
    channelId: CHANNEL,
    now: clock.now,
  });
  const steps: { next: Step; calls?: number; prompt?: string } = { next: "ok" };
  const workspace = opts.projectRoot
    ? { useWorktrees: true, defaultProjectRoot: opts.projectRoot }
    : { useWorktrees: false };
  const finished: ScheduleRunFinished[] = [];
  const daemon = new SchedulerService({
    store: new ScheduleStore({ db }),
    agent: stepAgent(steps),
    allowlist: allow([CHANNEL]),
    manual: true,
    ...workspace,
    now: () => clock.now,
    onRunFinished: (e) => finished.push(e),
  });
  const posts: Post[] = [];
  const bridgeStore = new ScheduleStore({ db });
  const bridge = new SchedulerService({
    store: bridgeStore,
    agent: stepAgent(steps),
    allowlist: opts.bridgeAllowlist ?? allow(opts.bridgeChannels ?? [CHANNEL]),
    manual: true,
    ...workspace,
    owner: OWNER,
    ...(opts.spendAlerts ? { spendAlerts: opts.spendAlerts } : {}),
    ...(opts.spendDm ? { spendDm: opts.spendDm as never } : {}),
    now: () => clock.now,
    outbound: { post: opts.post ?? (async (p) => void posts.push(p)) },
  });
  /** The daemon claims the next due run, which ends as `step`. */
  async function daemonRun(step: Step): Promise<void> {
    steps.next = step;
    clock.now += HOUR;
    expect((await daemon.tick()).started).toEqual([schedule.id]);
    await runsSettled(daemon);
  }
  /** The bridge claims the next due run itself (it posts in-process). */
  async function bridgeRun(step: Step): Promise<void> {
    steps.next = step;
    clock.now += HOUR;
    expect((await bridge.tick()).started).toEqual([schedule.id]);
    await runsSettled(bridge);
    await bridge.settleAskDelivery();
  }
  /** A bridge scheduler tick with nothing due (the 60 s poll). */
  async function bridgeTick(): Promise<void> {
    expect((await bridge.tick()).started).toEqual([]);
    await bridge.settleAskDelivery();
  }
  /** The owner presses Cancel on the schedule's open ask (AUTONOMY-6.a). */
  function cancelAsk(by: string = OWNER_ID): void {
    const open = setup.openAsk(schedule.id);
    expect(open).toBeDefined();
    expect(setup.closeRunAsk(open!.runId, { outcome: "cancelled", closedBy: by }, clock.now)).toBe(true);
  }
  function lastRun(): RunRow {
    return db
      .query(
        `SELECT status, summary, error, ask_reason, ask_question, ask_posted_at FROM schedule_runs
         WHERE schedule_id = ? ORDER BY rowid DESC LIMIT 1`,
      )
      .get(schedule.id) as RunRow;
  }
  function pingKeyRow(): string | null {
    return (
      db.query("SELECT ask_ping_key FROM schedules WHERE id = ?").get(schedule.id) as {
        ask_ping_key: string | null;
      }
    ).ask_ping_key;
  }
  function status(): string {
    return (
      db.query("SELECT status FROM schedules WHERE id = ?").get(schedule.id) as { status: string }
    ).status;
  }
  return {
    db,
    clock,
    setup,
    schedule,
    steps,
    status,
    daemon,
    bridge,
    posts,
    finished,
    daemonRun,
    bridgeRun,
    bridgeTick,
    lastRun,
    pingKeyRow,
    cancelAsk,
  };
}

function pinged(p: Post, who: string): boolean {
  return p.content.includes(`<@${who}>`) && (p.mentionUserIds ?? []).includes(who);
}

function silent(p: Post): boolean {
  return !p.content.includes("<@") && (p.mentionUserIds ?? []).length === 0;
}

describe("daemon-claimed schedule asks reach Discord through the bridge tick (REQ-discord-347)", () => {
  test("stuck: the run row keeps the ask; the bridge's next tick posts it once and pings the owner", async () => {
    const h = pair();
    await h.daemonRun(STUCK);
    // The daemon has no Discord: nothing posted, the operator log hook fired.
    expect(h.posts).toHaveLength(0);
    expect(h.finished).toHaveLength(1);
    expect(h.finished[0]).toMatchObject({ ok: false, askReason: "stuck" });
    expect(h.lastRun()).toMatchObject({
      status: "failed",
      summary: "failed (exit 1)",
      ask_reason: "stuck",
      ask_question: STUCK.question,
      ask_posted_at: null,
    });

    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    const post = h.posts[0]!;
    expect(post.channelId).toBe(CHANNEL);
    expect(post.content).toStartWith("Schedule **Nightly**");
    expect(post.content).toContain(`⚠️ I'm stuck and need a human. <@${OWNER_ID}>`);
    expect(post.content).toContain(`> ${STUCK.question}`);
    expect(post.mentionUserIds).toEqual([OWNER_ID]);
    expect(post.content).not.toContain(`<@${CREATOR_ID}>`);
    expect(h.lastRun().ask_posted_at).not.toBeNull();
    // Once per question (AUTONOMY-2): the ping is remembered like a bridge run's.
    expect(h.pingKeyRow()).toBe(askPingKey(STUCK));

    await h.bridgeTick();
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
  });

  test("clarify: the post pings the schedule creator, not the owner (AUTONOMY-4)", async () => {
    const h = pair();
    await h.daemonRun(CLARIFY);
    expect(h.lastRun()).toMatchObject({ status: "completed", ask_reason: "clarify" });
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]!.content).toContain(`❓ I need your input before I can continue. <@${CREATOR_ID}>`);
    expect(h.posts[0]!.content).toContain("> Postgres or SQLite?");
    expect(h.posts[0]!.mentionUserIds).toEqual([CREATOR_ID]);
    expect(h.posts[0]!.content).not.toContain(`<@${OWNER_ID}>`);
  });

  test("spend cap: the owner is pinged once per cap episode, the post says only that work is paused for budget (no question, no warning), no reply hint; the stored details go to the owner's DM pass (SAFE-8, SAFE-14.a)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    // Another run (any surface) crossed 80%: the warning is pending in the DB.
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
    const outbox = createSpendAlertOutbox({ db, env: { [SPEND_CAP_ENV]: "5" } });
    const handed: Array<{ stop?: { ask: HumanAsk; channelId?: string }; warning?: unknown }> = [];
    const spendDm = {
      async deliver(o: { stop?: { ask: HumanAsk; channelId?: string }; warning?: unknown } = {}) {
        handed.push(o);
        return { stop: "none", warning: "none" };
      },
    };
    const h = pair({ db, spendAlerts: outbox, spendDm });

    await h.daemonRun(CAP_ASK);
    expect(h.lastRun()).toMatchObject({ status: "completed", ask_reason: "spend-cap" });
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    const first = h.posts[0]!;
    // The schedule line, then only that work is paused for budget.
    expect(first.content).toStartWith("Schedule **Nightly**");
    expect(first.content.split("\n").slice(1)).toEqual([`💸 Work is paused for budget. <@${OWNER_ID}>`]);
    expect(first.content).not.toContain("Daily spend cap reached");
    expect(first.content).not.toContain("Spend warning");
    expect(first.content).not.toMatch(/\$\d|CORVIDINHO_|daily cap/);
    expect(first.content).not.toContain(ASK_REPLY_HINT);
    expect(first.mentionUserIds).toEqual([OWNER_ID]);
    // The stored question (amounts, cap, setting) is handed to the owner's DM.
    const stops = handed.filter((o) => o.stop);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.stop!.ask.question).toContain("Daily spend cap reached (SAFE-8)");
    expect(stops[0]!.stop!.channelId).toBe(CHANNEL);
    // Every bridge tick runs the owner's DM pass (the pending warning).
    expect(handed.some((o) => !o.stop)).toBe(true);

    // Same episode, next daemon run at the cap (after Cancel, AUTONOMY-6.a):
    // posted again, no second ping or DM.
    h.cancelAsk();
    await h.daemonRun(CAP_ASK);
    await h.bridgeTick();
    expect(h.posts).toHaveLength(2);
    expect(h.posts[1]!.content).toContain(SPEND_CAP_HEADLINE);
    expect(silent(h.posts[1]!)).toBe(true);
    expect(handed.filter((o) => o.stop)).toHaveLength(1);
  });

  test("spend cap: a daemon ask whose channel post keeps failing is retried every tick, but the owner gets its details by DM once, not every tick (SAFE-14.a)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const outbox = createSpendAlertOutbox({ db, env: { [SPEND_CAP_ENV]: "5" } });
    const dms: Array<{ userId: string; content: string }> = [];
    const spendDm = createSpendDm({
      outbox,
      owner: () => OWNER,
      sendDm: () => async ({ userId, content }) => {
        dms.push({ userId, content });
        return { channelId: "dm", messageId: `dm_${dms.length}` };
      },
      log: () => {},
    });
    let failing = true;
    const posts: Post[] = [];
    const h = pair({
      db,
      spendAlerts: outbox,
      spendDm,
      post: async (p) => {
        if (failing) return false;
        posts.push(p);
      },
    });
    await h.daemonRun(CAP_ASK);
    // The channel post fails on three ticks: each hands the ask and the cap
    // ping back for the next tick, but the details reach the owner once.
    for (let i = 0; i < 3; i++) await h.bridgeTick();
    expect(posts).toHaveLength(0);
    expect(h.lastRun().ask_posted_at).toBeNull();
    const stopDms = () => dms.filter((d) => d.content.includes("Daily spend cap reached"));
    expect(stopDms()).toHaveLength(1);
    expect(stopDms()[0]!.userId).toBe(OWNER_ID);
    // The channel works again: the ask posts with the ping; no second DM.
    failing = false;
    await h.bridgeTick();
    expect(posts).toHaveLength(1);
    expect(pinged(posts[0]!, OWNER_ID)).toBe(true);
    expect(stopDms()).toHaveLength(1);
  });

  test("spend cap: an episode another surface already pinged posts without a ping", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const outbox = createSpendAlertOutbox({ db, env: { [SPEND_CAP_ENV]: "5" } });
    expect(outbox.claimCapPing()).not.toBeNull(); // e.g. a chat reply pinged already
    const h = pair({ db, spendAlerts: outbox });
    await h.daemonRun(CAP_ASK);
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]!.content).toContain(SPEND_CAP_HEADLINE);
    expect(silent(h.posts[0]!)).toBe(true);
  });

  test("the same question in two daemon runs pings the owner once; only the open, newest ask is posted", async () => {
    const h = pair();
    await h.daemonRun(STUCK);
    await h.bridgeTick();
    h.cancelAsk();
    await h.daemonRun(STUCK);
    await h.bridgeTick();
    expect(h.posts).toHaveLength(2);
    expect(pinged(h.posts[0]!, OWNER_ID)).toBe(true);
    expect(h.posts[1]!.content).toContain(`> ${STUCK.question}`);
    expect(silent(h.posts[1]!)).toBe(true);

    // Two daemon runs before the bridge ticks (the first question cancelled
    // before any bridge posted it): only the newer, open question posts.
    h.cancelAsk();
    await h.daemonRun(CLARIFY);
    h.cancelAsk();
    await h.daemonRun({ reason: "clarify", question: "Which port?" });
    await h.bridgeTick();
    await h.bridgeTick();
    expect(h.posts).toHaveLength(3);
    expect(h.posts[2]!.content).toContain("> Which port?");
    expect(h.posts[2]!.content).not.toContain("Postgres");
    expect(pinged(h.posts[2]!, CREATOR_ID)).toBe(true);
  });

  test("a cancelled ask, a later finished run, or deleting the schedule, makes a pending ask moot", async () => {
    const h = pair();
    await h.daemonRun(STUCK);
    h.cancelAsk();
    await h.daemonRun("ok");
    await h.bridgeTick();
    expect(h.posts).toHaveLength(0);

    // A later run another ticker finished (a race past the wait): the older,
    // still-open ask is moot too.
    await h.daemonRun(STUCK);
    h.setup.refresh();
    const later = h.setup.claimRun(h.setup.get(h.schedule.id)!, h.clock.now + 1);
    expect(later).not.toBeNull();
    // Runs record their outcome at wall-clock time: finish this one later.
    h.setup.markRunFinished(h.setup.get(h.schedule.id)!, later!, { ok: true, summary: "done" }, Date.now() + 60_000);
    expect(h.setup.openAsk(h.schedule.id)).toBeUndefined();
    await h.bridgeTick();
    expect(h.posts).toHaveLength(0);

    await h.daemonRun("ok");
    await h.daemonRun(STUCK);
    h.setup.delete(h.schedule.id);
    await h.bridgeTick();
    expect(h.posts).toHaveLength(0);
  });

  test("a channel the bridge's allowlist refuses gets no post and the ask stays pending", async () => {
    const h = pair({ bridgeChannels: [] });
    await h.daemonRun(STUCK);
    await h.bridgeTick();
    expect(h.posts).toHaveLength(0);
    expect(h.lastRun().ask_posted_at).toBeNull();
    expect(h.pingKeyRow()).toBeNull();
  });

  test("a creator the live allowlist no longer lists gets no post; the ask stays pending until they are back (DISCORD-SCHEDULE-3)", async () => {
    const live = allow([CHANNEL]);
    live.discord.users = ["someone-else"];
    const h = pair({ bridgeAllowlist: live });
    await h.daemonRun(STUCK);
    await h.bridgeTick();
    expect(h.posts).toHaveLength(0);
    expect(h.lastRun().ask_posted_at).toBeNull();
    // Deny wins even for a listed creator.
    live.discord.users = [CREATOR_ID];
    live.discord.denyUsers = [CREATOR_ID];
    await h.bridgeTick();
    expect(h.posts).toHaveLength(0);
    expect(h.lastRun().ask_posted_at).toBeNull();
    // `/admin` edits the shared allowlist in place: the next tick posts it.
    live.discord.denyUsers = [];
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    expect(pinged(h.posts[0]!, OWNER_ID)).toBe(true);
    expect(h.lastRun().ask_posted_at).not.toBeNull();
  });

  test("a post that does not go out (false, or throws) is handed back and retried with its ping on the next tick", async () => {
    const outcomes: Array<"false" | "throw" | "ok"> = ["false", "throw", "ok"];
    const posts: Post[] = [];
    const h = pair({
      post: async (p) => {
        const next = outcomes.shift() ?? "ok";
        if (next === "false") return false;
        if (next === "throw") throw new Error("gateway down");
        posts.push(p);
        return true;
      },
    });
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      await h.daemonRun(STUCK);
      await h.bridgeTick();
      expect(posts).toHaveLength(0);
      expect(h.lastRun().ask_posted_at).toBeNull();
      expect(h.pingKeyRow()).toBeNull();
      await h.bridgeTick();
      expect(posts).toHaveLength(0);
      expect(h.lastRun().ask_posted_at).toBeNull();
      expect(err.mock.calls.some((c) => String(c[0]) === "[scheduler] ask failed: gateway down")).toBe(true);
      await h.bridgeTick();
      expect(posts).toHaveLength(1);
      expect(pinged(posts[0]!, OWNER_ID)).toBe(true);
      expect(h.pingKeyRow()).toBe(askPingKey(STUCK));
      await h.bridgeTick();
      expect(posts).toHaveLength(1);
    } finally {
      err.mockRestore();
    }
  });

  test("a run the bridge claimed is posted once, never again by its tick; two bridge tickers never double-post", async () => {
    const h = pair();
    await h.bridgeRun(STUCK);
    expect(h.posts).toHaveLength(1);
    expect(pinged(h.posts[0]!, OWNER_ID)).toBe(true);
    expect(h.lastRun().ask_posted_at).not.toBeNull();
    await h.bridgeTick();
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);

    // A second bridge-wired ticker on the same data dir (e.g. a restart overlap).
    const other: Post[] = [];
    const second = new SchedulerService({
      store: new ScheduleStore({ db: h.db }),
      agent: stepAgent({ next: "ok" }),
      allowlist: allow([CHANNEL]),
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      now: () => h.clock.now,
      outbound: { post: async (p) => void other.push(p) },
    });
    h.cancelAsk();
    await h.daemonRun(CLARIFY);
    await Promise.all([h.bridge.tick(), second.tick()]);
    await Promise.all([h.bridge.settleAskDelivery(), second.settleAskDelivery()]);
    expect(h.posts.length - 1 + other.length).toBe(1);
    expect([...h.posts.slice(1), ...other][0]!.content).toContain("> Postgres or SQLite?");
  });

  test("the daemon never posts, and an ask without a channel is never posted to a channel (without a DM path it stays pending)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "Quiet",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: CREATOR_ID,
      now: Date.now() - 2 * HOUR,
    });
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    const daemon = new SchedulerService({
      store,
      agent: stepAgent({ next: STUCK }),
      allowlist: allow([CHANNEL]),
      manual: true,
      useWorktrees: false,
    });
    await daemon.tick();
    await runsSettled(daemon);
    const posts: Post[] = [];
    const bridge = new SchedulerService({
      store: new ScheduleStore({ db }),
      agent: stepAgent({ next: "ok" }),
      allowlist: allow([CHANNEL]),
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      outbound: { post: async (p) => void posts.push(p) },
    });
    await bridge.tick();
    await bridge.settleAskDelivery();
    expect(posts).toHaveLength(0);
    expect(store.pendingAsks().map((p) => p.scheduleId)).toEqual([s.id]);
  });
});

describe("auto-pause and pre-run failures ask the owner instead of dying silently (REQ-discord-353, AUTONOMY-2)", () => {
  const PAUSED_LINE = `> Paused after ${FAILURE_AUTO_PAUSE} failed runs in a row. Fix the cause, then resume it with /schedule resume.`;

  function tempRoot(prefix: string): string {
    const root = mkdtempSync(join(tmpdir(), prefix));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    return root;
  }

  test("a daemon run that auto-pauses its schedule records a stuck ask; the bridge's next tick pings the owner once", async () => {
    const h = pair();
    for (let i = 1; i < FAILURE_AUTO_PAUSE; i++) {
      await h.daemonRun("fail");
      expect(h.lastRun()).toMatchObject({ status: "failed", ask_reason: null });
      expect(h.finished.at(-1)).toMatchObject({ ok: false, autoPaused: false });
    }
    await h.bridgeTick();
    expect(h.posts).toHaveLength(0);

    await h.daemonRun("fail");
    expect(h.status()).toBe("paused");
    expect(h.finished.at(-1)).toMatchObject({ ok: false, autoPaused: true, askReason: "stuck" });
    expect(h.lastRun()).toMatchObject({
      status: "failed",
      summary: "failed (exit 1)",
      ask_reason: "stuck",
      ask_question: autoPauseAsk().question,
      ask_posted_at: null,
    });

    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    const post = h.posts[0]!;
    expect(post.channelId).toBe(CHANNEL);
    expect(post.content).toStartWith("Schedule **Nightly**");
    expect(post.content).toContain(`⚠️ I'm stuck and need a human. <@${OWNER_ID}>`);
    expect(post.content).toContain(PAUSED_LINE);
    expect(post.content).toContain("failed (exit 1)");
    expect(post.mentionUserIds).toEqual([OWNER_ID]);
    expect(h.lastRun().ask_posted_at).not.toBeNull();

    await h.bridgeTick();
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
  });

  test("a stuck run that auto-pauses posts one ask naming the pause and its own question", async () => {
    const h = pair();
    for (let i = 1; i < FAILURE_AUTO_PAUSE; i++) await h.daemonRun("fail");
    await h.daemonRun(STUCK);
    expect(h.status()).toBe("paused");
    expect(h.lastRun()).toMatchObject({
      ask_reason: "stuck",
      ask_question: autoPauseAsk(STUCK).question,
    });
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    expect(pinged(h.posts[0]!, OWNER_ID)).toBe(true);
    expect(h.posts[0]!.content).toContain(`${PAUSED_LINE}\n> Last failure: ${STUCK.question}`);
  });

  test("a bridge run that auto-pauses posts the stuck ask with the owner ping instead of the ❌ line", async () => {
    const h = pair();
    for (let i = 1; i < FAILURE_AUTO_PAUSE; i++) await h.bridgeRun("fail");
    expect(h.posts).toHaveLength(FAILURE_AUTO_PAUSE - 1);
    for (const p of h.posts) {
      expect(p.content).toStartWith("❌ Schedule **Nightly**");
      expect(silent(p)).toBe(true);
    }

    await h.bridgeRun("fail");
    expect(h.status()).toBe("paused");
    expect(h.posts).toHaveLength(FAILURE_AUTO_PAUSE);
    const last = h.posts.at(-1)!;
    expect(last.content).toStartWith("Schedule **Nightly**");
    expect(last.content).toContain(PAUSED_LINE);
    // Like the ❌ line it replaces (and the delivery pass): the exit code,
    // never the failed run's own output.
    expect(last.content).toContain("failed (exit 1)");
    expect(last.content).not.toContain("boom");
    expect(pinged(last, OWNER_ID)).toBe(true);
    expect(h.lastRun().ask_posted_at).not.toBeNull();
    expect(h.pingKeyRow()).toBe(askPingKey(autoPauseAsk()));

    await h.bridgeTick();
    expect(h.posts).toHaveLength(FAILURE_AUTO_PAUSE);
  });

  test("a pause ask whose in-process post does not go out (false, or throws) is handed back; the next tick posts it once with the ping", async () => {
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const failure of ["false", "throw"] as const) {
        const posts: Post[] = [];
        let down = false;
        const h = pair({
          post: async (p) => {
            if (!down) return void posts.push(p);
            if (failure === "throw") throw new Error("gateway down");
            return false;
          },
        });
        for (let i = 1; i < FAILURE_AUTO_PAUSE; i++) await h.bridgeRun("fail");
        expect(posts).toHaveLength(FAILURE_AUTO_PAUSE - 1);

        down = true;
        await h.bridgeRun("fail");
        expect(h.status()).toBe("paused");
        expect(posts).toHaveLength(FAILURE_AUTO_PAUSE - 1);
        // A paused schedule has no next run to post it: the ask stays pending.
        expect(h.lastRun()).toMatchObject({
          ask_reason: "stuck",
          ask_question: autoPauseAsk().question,
          ask_posted_at: null,
        });
        expect(h.pingKeyRow()).toBeNull();

        down = false;
        await h.bridgeTick();
        expect(posts).toHaveLength(FAILURE_AUTO_PAUSE);
        expect(posts.at(-1)!.content).toContain(PAUSED_LINE);
        expect(pinged(posts.at(-1)!, OWNER_ID)).toBe(true);
        expect(h.pingKeyRow()).toBe(askPingKey(autoPauseAsk()));
        await h.bridgeTick();
        expect(posts).toHaveLength(FAILURE_AUTO_PAUSE);
      }
    } finally {
      err.mockRestore();
    }
  });

  test("a bridge run that throws and auto-pauses posts the pause ask at once, without the error text", async () => {
    const h = pair();
    for (let i = 1; i < FAILURE_AUTO_PAUSE; i++) await h.bridgeRun("throw");
    const before = h.posts.length;
    await h.bridgeRun("throw");
    expect(h.status()).toBe("paused");
    expect(h.lastRun()).toMatchObject({ status: "failed", error: SPAWN_ERROR, ask_reason: "stuck" });
    expect(h.lastRun().ask_posted_at).not.toBeNull();
    expect(h.posts).toHaveLength(before + 1);
    const post = h.posts.at(-1)!;
    expect(post.content).toContain(PAUSED_LINE);
    expect(post.content).not.toContain("/opt/host-only");
    expect(pinged(post, OWNER_ID)).toBe(true);

    await h.bridgeTick();
    expect(h.posts).toHaveLength(before + 1);
  });

  test("refused runs that auto-pause post nothing while refused; the pause ask posts once the creator is allowed again", async () => {
    const live = allow([CHANNEL]);
    live.discord.users = ["someone-else"];
    const h = pair({ bridgeAllowlist: live });
    for (let i = 0; i < FAILURE_AUTO_PAUSE; i++) await h.bridgeRun("ok");
    expect(h.steps.calls ?? 0).toBe(0);
    expect(h.status()).toBe("paused");
    expect(h.posts).toHaveLength(0);
    expect(h.lastRun()).toMatchObject({
      status: "failed",
      ask_reason: "stuck",
      ask_question: autoPauseAsk().question,
      ask_posted_at: null,
    });
    expect(h.lastRun().error).toStartWith("creator not allowlisted");

    live.discord.users = [CREATOR_ID];
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]!.content).toContain(PAUSED_LINE);
    expect(pinged(h.posts[0]!, OWNER_ID)).toBe(true);
  });

  test("a daemon run whose project cannot be resolved records a stuck ask without the host path; the bridge pings the owner once per question", async () => {
    const root = tempRoot("corvidinho-prerun-resolve-");
    const h = pair({ projectRoot: root, project: "missing-proj" });
    await h.daemonRun("ok");
    expect(h.steps.calls ?? 0).toBe(0);
    const row = h.lastRun();
    expect(row).toMatchObject({
      status: "failed",
      summary: null,
      ask_reason: "stuck",
      ask_question: PROJECT_RESOLVE_FAILED_QUESTION,
      ask_posted_at: null,
    });
    // The full error (with host paths) stays on the run row.
    expect(row.error).toStartWith("project resolve failed: project path not found: missing-proj");
    expect(row.error).toContain(root);
    expect(h.finished.at(-1)).toMatchObject({ ok: false, autoPaused: false, askReason: "stuck" });

    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    const post = h.posts[0]!;
    expect(post.content).toStartWith("Schedule **Nightly**");
    expect(post.content).toContain(`⚠️ I'm stuck and need a human. <@${OWNER_ID}>`);
    expect(post.content).toContain(`> ${PROJECT_RESOLVE_FAILED_QUESTION}`);
    expect(post.content).not.toContain(root);
    expect(post.mentionUserIds).toEqual([OWNER_ID]);

    // The same failure again (after Cancel, AUTONOMY-6.a) posts without a
    // second ping (AUTONOMY-2 once).
    h.cancelAsk();
    await h.daemonRun("ok");
    await h.bridgeTick();
    expect(h.posts).toHaveLength(2);
    expect(h.posts[1]!.content).toContain(`> ${PROJECT_RESOLVE_FAILED_QUESTION}`);
    expect(silent(h.posts[1]!)).toBe(true);
  });

  test("a bridge run whose worktree cannot be created posts its stuck ask at once, once", async () => {
    const root = tempRoot("corvidinho-prerun-worktree-");
    const project = join(root, "proj");
    mkdirSync(project);
    const git = (args: string[]) => {
      const p = Bun.spawnSync(["git", ...args], { cwd: project, stdout: "pipe", stderr: "pipe" });
      expect(p.exitCode).toBe(0);
    };
    git(["init", "-q"]);
    git(["remote", "add", "origin", "https://github.com/CorvidLabs/proj.git"]);
    git(["-c", "user.email=t@example.com", "-c", "user.name=T", "commit", "-q", "--allow-empty", "-m", "init"]);
    // A `talk` branch blocks every `talk/<run>` branch: `git worktree add` fails.
    git(["branch", "talk"]);
    const h = pair({ projectRoot: root, project: "proj" });

    await h.bridgeRun("ok");
    expect(h.steps.calls ?? 0).toBe(0);
    const row = h.lastRun();
    expect(row).toMatchObject({
      status: "failed",
      ask_reason: "stuck",
      ask_question: WORKTREE_FAILED_QUESTION,
    });
    expect(row.error).toStartWith("worktree failed: Failed to create worktree:");
    expect(row.ask_posted_at).not.toBeNull();
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]!.content).toContain(`⚠️ I'm stuck and need a human. <@${OWNER_ID}>`);
    expect(h.posts[0]!.content).toContain(`> ${WORKTREE_FAILED_QUESTION}`);
    expect(h.posts[0]!.content).not.toContain(root);
    expect(h.posts[0]!.mentionUserIds).toEqual([OWNER_ID]);

    await h.bridgeTick();
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
  });

  test("a worktree step that throws (not a directory) fails the run like one that returns an error", async () => {
    const root = tempRoot("corvidinho-prerun-throw-");
    mkdirSync(join(root, "proj"));
    const notADir = join(root, "not-a-dir");
    writeFileSync(notADir, "");
    const saved = process.env.WORKTREE_BASE_DIR;
    // mkdir of the worktree base under a regular file throws ENOTDIR.
    process.env.WORKTREE_BASE_DIR = join(notADir, "wts");
    try {
      const h = pair({ projectRoot: root, project: "proj" });
      await h.bridgeRun("ok");
      expect(h.steps.calls ?? 0).toBe(0);
      const row = h.lastRun();
      expect(row).toMatchObject({
        status: "failed",
        ask_reason: "stuck",
        ask_question: WORKTREE_FAILED_QUESTION,
      });
      expect(row.error).toStartWith("worktree failed: ");
      expect(row.ask_posted_at).not.toBeNull();
      expect(h.posts).toHaveLength(1);
      expect(h.posts[0]!.content).toContain(`> ${WORKTREE_FAILED_QUESTION}`);
      expect(h.posts[0]!.content).not.toContain(root);
      expect(pinged(h.posts[0]!, OWNER_ID)).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.WORKTREE_BASE_DIR;
      else process.env.WORKTREE_BASE_DIR = saved;
    }
  });

  test("a daemon run whose absolute project cannot be resolved posts its stuck ask naming the project, never the host path", async () => {
    const base = tempRoot("corvidinho-prerun-abs-");
    const root = join(base, "root");
    mkdirSync(root);
    // An absolute sibling of the root is in reach: resolve looks for it and fails.
    const project = join(base, "gone");
    const h = pair({ projectRoot: root, project });
    await h.daemonRun("ok");
    expect(h.steps.calls ?? 0).toBe(0);
    const row = h.lastRun();
    expect(row).toMatchObject({
      status: "failed",
      ask_reason: "stuck",
      ask_question: PROJECT_RESOLVE_FAILED_QUESTION,
      ask_posted_at: null,
    });
    // The full error (with the host path) stays on the run row.
    expect(row.error).toStartWith(`project resolve failed: project path not found: ${project}`);

    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    const post = h.posts[0]!;
    expect(post.content.split("\n")[0]).toBe(
      `Schedule **Nightly** (\`${h.schedule.id.slice(0, 12)}\`) on \`gone\`:`,
    );
    expect(post.content).toContain(`> ${PROJECT_RESOLVE_FAILED_QUESTION}`);
    expect(post.content).not.toContain(base);
    expect(pinged(post, OWNER_ID)).toBe(true);
  });

  test("result and ask posts of a schedule on an absolute project name the project, never the host path; the model's prompt keeps it", async () => {
    const project = "/srv/host-only/acme/Widget";
    const h = pair({ project });
    const title = `Schedule **Nightly** (\`${h.schedule.id.slice(0, 12)}\`) on \`Widget\`:`;
    await h.bridgeRun("ok");
    expect(h.steps.prompt).toContain(`on project: ${project}`);
    await h.bridgeRun("fail");
    await h.bridgeRun(CLARIFY);
    h.cancelAsk();
    await h.bridgeRun(STUCK);
    h.cancelAsk();
    // A daemon-claimed ask goes out through the bridge's delivery pass.
    await h.daemonRun({ reason: "stuck", question: "Which branch should I rebase onto?" });
    await h.bridgeTick();
    expect(h.posts.map((p) => p.content.split("\n")[0])).toEqual([
      `✅ ${title}`,
      `❌ ${title}`,
      title,
      title,
      title,
    ]);
    for (const p of h.posts) expect(p.content).not.toContain("/srv/host-only");
  });
});

describe("a delivery pass that is still posting (REQ-discord-347 staleness, stop)", () => {
  const CHAN_A = "chan-a";
  const CHAN_B = "chan-b";

  /**
   * Two schedules on one DB, a daemon-wired and a bridge-wired scheduler; the
   * bridge's post can be held open to stand for a slow Discord call.
   */
  function twoSchedules() {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const clock = { now: Date.parse("2026-09-27T10:30:00Z") };
    const setup = new ScheduleStore({ db });
    const mk = (name: string, channelId: string) =>
      setup.create({
        name,
        cronExpression: "0 * * * *",
        project: "proj-a",
        prompt: "do thing",
        createdByUserId: CREATOR_ID,
        channelId,
        now: clock.now,
      });
    const a = mk("Alpha", CHAN_A);
    const b = mk("Beta", CHAN_B);
    const steps: { next: Step } = { next: "ok" };
    const daemon = new SchedulerService({
      store: new ScheduleStore({ db }),
      agent: stepAgent(steps),
      allowlist: allow([CHAN_A, CHAN_B]),
      manual: true,
      useWorktrees: false,
      now: () => clock.now,
    });
    const started: Post[] = [];
    const posts: Post[] = [];
    let held: Promise<void> | null = null;
    const bridge = new SchedulerService({
      store: new ScheduleStore({ db }),
      agent: stepAgent({ next: "ok" }),
      allowlist: allow([CHAN_A, CHAN_B]),
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      now: () => clock.now,
      outbound: {
        post: async (p) => {
          started.push(p);
          if (held) await held;
          posts.push(p);
          return true;
        },
      },
    });
    /** Only schedule `id` is due; the daemon runs it to `step`. */
    async function daemonRun(id: string, step: Step): Promise<void> {
      steps.next = step;
      clock.now += HOUR;
      db.run("UPDATE schedules SET next_run_at = CASE WHEN id = ? THEN ? ELSE ? END", [
        id,
        clock.now - 1,
        clock.now + 10 * HOUR,
      ]);
      expect((await daemon.tick()).started).toEqual([id]);
      await runsSettled(daemon);
    }
    /** Hold the bridge's posts open until the returned function is called. */
    function hold(): () => void {
      let open!: () => void;
      held = new Promise<void>((resolve) => {
        open = resolve;
      });
      return open;
    }
    function askPostedAt(scheduleId: string): number | null {
      return (
        db
          .query(
            `SELECT ask_posted_at FROM schedule_runs
             WHERE schedule_id = ? AND ask_reason IS NOT NULL ORDER BY rowid DESC LIMIT 1`,
          )
          .get(scheduleId) as { ask_posted_at: number | null }
      ).ask_posted_at;
    }
    return { a, b, bridge, started, posts, daemonRun, hold, askPostedAt, store: setup };
  }

  test("an ask cancelled while the pass is posting another one is not posted", async () => {
    const h = twoSchedules();
    await h.daemonRun(h.a.id, STUCK);
    await h.daemonRun(h.b.id, CLARIFY);
    const open = h.hold();
    await h.bridge.tick(); // the pass lists both asks and posts Alpha's first
    expect(h.started.map((p) => p.channelId)).toEqual([CHAN_A]);
    // Meanwhile Beta's question is cancelled (AUTONOMY-6.a): it is not posted.
    const beta = h.store.openAsk(h.b.id)!;
    expect(h.store.closeRunAsk(beta.runId, { outcome: "cancelled", closedBy: CREATOR_ID })).toBe(true);
    open();
    await h.bridge.settleAskDelivery();
    expect(h.posts.map((p) => p.channelId)).toEqual([CHAN_A]);
    expect(h.askPostedAt(h.b.id)).toBeNull();
    await h.bridge.tick();
    await h.bridge.settleAskDelivery();
    expect(h.posts).toHaveLength(1);
  });

  test("stop() ends the pass before its next claim; settleAskDelivery waits for the post in flight", async () => {
    const h = twoSchedules();
    await h.daemonRun(h.a.id, STUCK);
    await h.daemonRun(h.b.id, CLARIFY);
    const open = h.hold();
    await h.bridge.tick();
    expect(h.started).toHaveLength(1);
    h.bridge.stop();
    // Bounded: the post in flight is still going.
    expect(await h.bridge.settleAskDelivery(20)).toBe(false);
    open();
    expect(await h.bridge.settleAskDelivery(1000)).toBe(true);
    expect(h.posts.map((p) => p.channelId)).toEqual([CHAN_A]);
    expect(h.askPostedAt(h.a.id)).not.toBeNull();
    // Beta's ask was not taken: it waits for the next start.
    expect(h.askPostedAt(h.b.id)).toBeNull();
    await h.bridge.tick();
    await h.bridge.settleAskDelivery();
    expect(h.posts).toHaveLength(1);
    h.bridge.start();
    try {
      await h.bridge.tick();
      await h.bridge.settleAskDelivery();
      expect(h.posts.map((p) => p.channelId)).toEqual([CHAN_A, CHAN_B]);
      expect(pinged(h.posts[1]!, CREATOR_ID)).toBe(true);
    } finally {
      h.bridge.stop();
    }
  });
});

describe("schema v11 schedule_runs ask columns (REQ-discord-347, SAFE-6)", () => {
  function columns(db: Database): string[] {
    return (db.query("PRAGMA table_info(schedule_runs)").all() as Array<{ name: string }>).map(
      (c) => c.name,
    );
  }

  test("a v10 DB migrates to v11, keeps its runs and posts none of them", () => {
    // v12 (forget requests, REQ-discord-101), v13 (retained
    // conversations, REQ-discord-472), v14 (approval cards,
    // REQ-discord-096) and v15 (blocking schedule asks, REQ-discord-606)
    // follow; the v11 columns stay.
    expect(SCHEMA_VERSION).toBe(15);
    const db = new SqliteDatabase(":memory:");
    cleanups.push(() => db.close());
    migrateCorvidinhoDb(db);
    expect(columns(db)).toEqual(
      expect.arrayContaining(["ask_reason", "ask_question", "ask_posted_at"]),
    );
    const s = new ScheduleStore({ db }).create({
      name: "Old",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: CREATOR_ID,
      channelId: CHANNEL,
    });
    // Back to v10: no ask columns, one finished run from before the upgrade.
    db.exec("DROP INDEX idx_schedule_runs_pending_ask");
    for (const c of ["ask_reason", "ask_question", "ask_posted_at"]) {
      db.exec(`ALTER TABLE schedule_runs DROP COLUMN ${c}`);
    }
    db.run("UPDATE schema_meta SET value = '10' WHERE key = 'version'");
    db.run(
      `INSERT INTO schedule_runs (id, schedule_id, status, summary, started_at, completed_at)
       VALUES ('srun_old000000001', ?, 'failed', 'failed (exit 1)', 1, 2)`,
      [s.id],
    );
    migrateCorvidinhoDb(db);
    const v = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(v.value).toBe(String(SCHEMA_VERSION));
    expect(columns(db)).toEqual(
      expect.arrayContaining(["ask_reason", "ask_question", "ask_posted_at"]),
    );
    const row = db.query("SELECT * FROM schedule_runs WHERE id = 'srun_old000000001'").get() as RunRow;
    expect(row).toMatchObject({ status: "failed", ask_reason: null, ask_question: null });
    expect(new ScheduleStore({ db }).pendingAsks()).toEqual([]);
  });

  test("the question is scrubbed at rest and in the post; ask_question is a re-scrub target", async () => {
    const token = "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);
    const h = pair();
    await h.daemonRun({ reason: "stuck", question: `Push failed with ${token}. Retry?` });
    const stored = h.lastRun().ask_question!;
    expect(stored).not.toContain(token);
    expect(stored).toContain("[redacted:github-token]");
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]!.content).not.toContain(token);

    expect(SCRUB_TARGETS).toContainEqual({
      table: "schedule_runs",
      columns: ["summary", "error", "ask_question", "ask_answer"],
      json: ["ask_options"],
    });
    // A raw secret written by an older build is re-scrubbed.
    h.db.run("UPDATE schedule_runs SET ask_question = ? WHERE schedule_id = ?", [
      `token ${token}`,
      h.schedule.id,
    ]);
    const res = rescrubDatabase(h.db);
    expect(res.byTable.schedule_runs).toBe(1);
    expect(h.lastRun().ask_question).toBe("token [redacted:github-token]");
  });

  test("SAFE-6.a: a question whose secret straddles the ASK_QUESTION_MAX cut is [redacted:<kind>] in the run row and the posts", async () => {
    const token = "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);
    const mark = "[redacted:github-token]";
    // The whole marker fits before the cut; a cut before the scrub kept
    // `ghp_` plus 19 raw characters, one short of the scrub pattern.
    const pad = ASK_QUESTION_MAX - mark.length - 1;
    const question = `${"q".repeat(pad - 1)} ${token} — retry the push?`;
    // As the spawn client reads the child's result frame (agent-client.ts).
    const ask = askFromUnknown({ reason: "stuck", question })!;
    const shown = `${"q".repeat(pad - 1)} ${mark}…`;
    expect(ask.question).toBe(shown);

    const h = pair();
    await h.daemonRun(ask);
    const run = h.lastRun();
    expect(run.ask_question).toBe(shown);
    expect(`${run.summary}`).not.toContain(token.slice(0, 4));
    await h.bridgeTick();
    // The bridge claims the next run itself (after Cancel, AUTONOMY-6.a)
    // and posts it in-process.
    h.cancelAsk();
    await h.bridgeRun(askFromUnknown({ reason: "clarify", question })!);
    expect(h.lastRun().ask_question).toBe(shown);
    expect(h.posts).toHaveLength(2);
    expect(JSON.stringify(h.posts)).not.toContain(token.slice(0, 4));
  });
});

describe("`corvidinho daemon` + Discord bridge on one data dir (AUTONOMOUS-4 / AUTONOMOUS-7)", () => {
  test("the daemon logs run.needs_human and leaves the ask pending; the bridge's scheduler tick posts it to the owner", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "corvidinho-ask-outbox-"));
    const projectRoot = mkdtempSync(join(tmpdir(), "corvidinho-ask-outbox-proj-"));
    cleanups.push(() => {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
    });
    const env = {
      ...process.env,
      CORVIDINHO_DATA_DIR: dataDir,
      DISCORD_CHANNEL_IDS: CHANNEL,
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

    const lines: Array<Record<string, unknown>> = [];
    const d = await startDaemon({
      env,
      projectRoot,
      logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
      agent: stepAgent({ next: STUCK }),
      useWorktrees: false,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    await d.tick();
    await runsSettled(d.scheduler);
    await d.stop("SIGTERM");
    expect(lines.find((l) => l.event === "run.needs_human")).toMatchObject({
      level: "warn",
      scheduleId: s.id,
      reason: "stuck",
    });

    const replies: Post[] = [];
    const db = openCorvidinhoDb({ env });
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
        handlers.reply = async (opts) => {
          replies.push(opts);
          return { messageId: `bot_${replies.length}` };
        };
        return createNullGateway();
      },
    });
    expect(bridge.ok).toBe(true);
    if (!bridge.ok) return;
    try {
      for (let i = 0; i < 150 && replies.length === 0; i++) await Bun.sleep(20);
      expect(replies).toHaveLength(1);
      expect(replies[0]!.channelId).toBe(CHANNEL);
      expect(replies[0]!.content).toContain(`⚠️ I'm stuck and need a human. <@${OWNER_ID}>`);
      expect(replies[0]!.content).toContain(`> ${STUCK.question}`);
      expect(replies[0]!.mentionUserIds).toEqual([OWNER_ID]);
      // Later polls do not post it again.
      await Bun.sleep(100);
      expect(replies).toHaveLength(1);
    } finally {
      await bridge.stop();
      db.close();
    }
  });

  test("bridge stop waits for a pending-ask post in flight before closing the gateway", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "corvidinho-ask-outbox-stop-"));
    const projectRoot = mkdtempSync(join(tmpdir(), "corvidinho-ask-outbox-stop-proj-"));
    cleanups.push(() => {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
    });
    const db = openCorvidinhoDb({ env: { CORVIDINHO_DATA_DIR: dataDir } });
    cleanups.push(() => db.close());
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "summarize",
      createdByUserId: CREATOR_ID,
      channelId: CHANNEL,
    });
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    const daemon = new SchedulerService({
      store,
      agent: stepAgent({ next: STUCK }),
      allowlist: allow([CHANNEL]),
      manual: true,
      useWorktrees: false,
    });
    await daemon.tick();
    await runsSettled(daemon);

    const events: string[] = [];
    let open!: () => void;
    const held = new Promise<void>((resolve) => {
      open = resolve;
    });
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
        handlers.reply = async () => {
          events.push("post.start");
          await held;
          events.push("post.end");
          return { messageId: "bot_1" };
        };
        const gw = createNullGateway();
        return {
          ...gw,
          stop: async () => {
            events.push("gateway.stop");
            await gw.stop();
          },
        };
      },
    });
    expect(bridge.ok).toBe(true);
    if (!bridge.ok) return;
    for (let i = 0; i < 150 && !events.includes("post.start"); i++) await Bun.sleep(20);
    expect(events).toEqual(["post.start"]);
    const stopping = bridge.stop();
    setTimeout(() => open(), 50);
    await stopping;
    expect(events).toEqual(["post.start", "post.end", "gateway.stop"]);
    const row = db
      .query("SELECT ask_posted_at FROM schedule_runs WHERE schedule_id = ?")
      .get(s.id) as { ask_posted_at: number | null };
    expect(row.ask_posted_at).not.toBeNull();
  });
});
