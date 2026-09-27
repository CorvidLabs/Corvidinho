/**
 * REQ-discord-347 — needs-human outbox for schedule runs (AUTONOMY-2 /
 * AUTONOMOUS-7, #97 #104). A schedule run `corvidinho daemon` claims has no
 * Discord: when it stops to ask a human (stuck, clarify, spend cap) the ask
 * is recorded on its run row, and the bridge's next scheduler tick posts it
 * to the schedule's channel once, with the same pings as a run the bridge
 * claimed (owner for stuck / spend-cap, schedule creator for clarify;
 * AUTONOMY-4, SAFE-8). Fixtures only: in-memory / temp SQLite, injected
 * agents, a null gateway; no live Discord, no network, no git worktrees.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database as SqliteDatabase, type Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatAskSummary, stuckAfterVerifyAsk } from "../src/agent/ask.ts";
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
import { SchedulerService, type ScheduleRunFinished } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { migrateCorvidinhoDb, openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";

const OWNER_ID = "111122223333444455";
const OWNER = { discordId: OWNER_ID, display: "Leif" };
const CREATOR_ID = "222233334444555566";
const CHANNEL = "chan-allowed";
const HOUR = 3_600_000;
const STUCK: HumanAsk = stuckAfterVerifyAsk(2);
const CLARIFY: HumanAsk = { reason: "clarify", question: "Postgres or SQLite?" };
const CAP_ASK: HumanAsk = spendCapReachedAsk({
  spentMicroUsd: 4_999_000,
  estimateMicroUsd: 2_600,
  capMicroUsd: 5_000_000,
});

type Step = HumanAsk | "ok";
type Post = { channelId: string; content: string; mentionUserIds?: string[] };

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** Agent whose next run ends as `steps.next` (the task run's result shapes). */
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

type RunRow = {
  status: string;
  summary: string | null;
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
    post?: (p: Post) => Promise<void | boolean>;
    spendAlerts?: SpendAlertOutbox;
  } = {},
) {
  const db = opts.db ?? openCorvidinhoDb({ memory: true });
  cleanups.push(() => db.close());
  const clock = { now: Date.parse("2026-09-27T10:30:00Z") };
  const setup = new ScheduleStore({ db });
  const schedule = setup.create({
    name: "Nightly",
    cronExpression: "0 * * * *",
    project: "proj-a",
    prompt: "do thing",
    createdByUserId: CREATOR_ID,
    channelId: CHANNEL,
    now: clock.now,
  });
  const steps: { next: Step } = { next: "ok" };
  const finished: ScheduleRunFinished[] = [];
  const daemon = new SchedulerService({
    store: new ScheduleStore({ db }),
    agent: stepAgent(steps),
    allowlist: allow([CHANNEL]),
    manual: true,
    useWorktrees: false,
    now: () => clock.now,
    onRunFinished: (e) => finished.push(e),
  });
  const posts: Post[] = [];
  const bridgeStore = new ScheduleStore({ db });
  const bridge = new SchedulerService({
    store: bridgeStore,
    agent: stepAgent(steps),
    allowlist: allow(opts.bridgeChannels ?? [CHANNEL]),
    manual: true,
    useWorktrees: false,
    owner: OWNER,
    ...(opts.spendAlerts ? { spendAlerts: opts.spendAlerts } : {}),
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
  function lastRun(): RunRow {
    return db
      .query(
        `SELECT status, summary, ask_reason, ask_question, ask_posted_at FROM schedule_runs
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
  return {
    db,
    clock,
    setup,
    schedule,
    daemon,
    bridge,
    posts,
    finished,
    daemonRun,
    bridgeRun,
    bridgeTick,
    lastRun,
    pingKeyRow,
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

  test("spend cap: the owner is pinged once per cap episode, the pending 80% warning rides the post, no reply hint (SAFE-8)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    // Another run (any surface) crossed 80%: the warning is pending in the DB.
    const ledger = new SpendLedger(db);
    ledger.reserve({ provider: "p", model: "gpt-4o-mini", estimateMicroUsd: 850_000, capMicroUsd: 1e12, now: Date.now() - 1000 });
    expect(ledger.noteWarning({ capMicroUsd: 1_000_000, now: Date.now() })).not.toBeNull();
    const outbox = createSpendAlertOutbox({ db, env: { [SPEND_CAP_ENV]: "5" } });
    const h = pair({ db, spendAlerts: outbox });

    await h.daemonRun(CAP_ASK);
    expect(h.lastRun()).toMatchObject({ status: "completed", ask_reason: "spend-cap" });
    await h.bridgeTick();
    expect(h.posts).toHaveLength(1);
    const first = h.posts[0]!;
    expect(first.content).toContain(`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`);
    expect(first.content).toContain(`⚠️ <@${OWNER_ID}> Spend warning (SAFE-8): $0.85 of the $1.00 daily cap`);
    expect(first.content).not.toContain(ASK_REPLY_HINT);
    expect(first.mentionUserIds).toEqual([OWNER_ID]);

    // Same episode, next daemon run at the cap: posted again, no second ping.
    await h.daemonRun(CAP_ASK);
    await h.bridgeTick();
    expect(h.posts).toHaveLength(2);
    expect(h.posts[1]!.content).toContain(SPEND_CAP_HEADLINE);
    expect(silent(h.posts[1]!)).toBe(true);
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

  test("the same question in two daemon runs pings the owner once; only the newest pending ask is posted", async () => {
    const h = pair();
    await h.daemonRun(STUCK);
    await h.bridgeTick();
    await h.daemonRun(STUCK);
    await h.bridgeTick();
    expect(h.posts).toHaveLength(2);
    expect(pinged(h.posts[0]!, OWNER_ID)).toBe(true);
    expect(h.posts[1]!.content).toContain(`> ${STUCK.question}`);
    expect(silent(h.posts[1]!)).toBe(true);

    // Two daemon runs before the bridge ticks: only the newer question posts.
    await h.daemonRun(CLARIFY);
    await h.daemonRun({ reason: "clarify", question: "Which port?" });
    await h.bridgeTick();
    await h.bridgeTick();
    expect(h.posts).toHaveLength(3);
    expect(h.posts[2]!.content).toContain("> Which port?");
    expect(h.posts[2]!.content).not.toContain("Postgres");
    expect(pinged(h.posts[2]!, CREATOR_ID)).toBe(true);
  });

  test("a later finished run, or deleting the schedule, makes a pending ask moot", async () => {
    const h = pair();
    await h.daemonRun(STUCK);
    await h.daemonRun("ok");
    await h.bridgeTick();
    expect(h.posts).toHaveLength(0);

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
    await h.daemonRun(CLARIFY);
    await Promise.all([h.bridge.tick(), second.tick()]);
    await Promise.all([h.bridge.settleAskDelivery(), second.settleAskDelivery()]);
    expect(h.posts.length - 1 + other.length).toBe(1);
    expect([...h.posts.slice(1), ...other][0]!.content).toContain("> Postgres or SQLite?");
  });

  test("the daemon never posts and an ask without a channel is never delivered", async () => {
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

describe("schema v11 schedule_runs ask columns (REQ-discord-347, SAFE-6)", () => {
  function columns(db: Database): string[] {
    return (db.query("PRAGMA table_info(schedule_runs)").all() as Array<{ name: string }>).map(
      (c) => c.name,
    );
  }

  test("a v10 DB migrates to v11, keeps its runs and posts none of them", () => {
    expect(SCHEMA_VERSION).toBe(11);
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
    expect(v.value).toBe("11");
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
      columns: ["summary", "error", "ask_question"],
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
});
