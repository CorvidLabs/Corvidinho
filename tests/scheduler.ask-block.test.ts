/**
 * AUTONOMY-6.a (REQ-discord-606) — "A scheduled run's question can be
 * answered or cancelled by me or the schedule's creator, and the schedule's
 * next runs wait, with one note, until it is."
 *
 * Scheduler side: every ask a run records blocks its schedule — a run's own
 * clarify / stuck / spend-cap ask, and the scheduler's own REQ-discord-353
 * asks (could not start, auto-pause). While it is open each due run is
 * skipped with no catch-up and one wait note goes out, pinging nobody; the
 * ask post carries its controls (Choose or Answer, and Cancel; Cancel only
 * for a spend-cap stop); a schedule with no channel sends the ask, its
 * controls and the note to the owner by DM; `/schedule resume` does not
 * close it; the answer reaches the next run once; schema v15 closes asks
 * recorded before it. Fixtures only: in-memory / temp SQLite, injected
 * agents, recorded posts and DMs; no live Discord, no network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Database as SqliteDatabase, type Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatAskSummary, stuckAfterVerifyAsk } from "../src/agent/ask.ts";
import { SPEND_CAP_SUMMARY, spendCapReachedAsk } from "../src/agent/spend-notice.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { cancelCustomId, openCustomId } from "../src/discord/ask-buttons.ts";
import { ASK_ANSWER_HINT, ASK_REPLY_HINT, SPEND_CAP_HEADLINE } from "../src/discord/ask-ping.ts";
import {
  SCHEDULE_ASK_ANSWER_HINT,
  SCHEDULE_ASK_CHOOSE_HINT,
} from "../src/discord/schedule-ask.ts";
import { getNextCronDate } from "../src/scheduler/cron.ts";
import {
  FAILURE_AUTO_PAUSE,
  PROJECT_RESOLVE_FAILED_QUESTION,
  SchedulerService,
} from "../src/scheduler/service.ts";
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
const PICK: HumanAsk = {
  reason: "clarify",
  question: "Which database?",
  options: [
    { id: "pg", label: "Postgres" },
    { id: "lite", label: "SQLite" },
  ],
};
const CAP_ASK: HumanAsk = spendCapReachedAsk({
  spentMicroUsd: 4_999_000,
  estimateMicroUsd: 2_600,
  capMicroUsd: 5_000_000,
});
const TOKEN = "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);

type Step = HumanAsk | "ok" | "fail";
type Post = { channelId: string; content: string; mentionUserIds?: string[]; components?: unknown[] };
type Dm = { userId: string; content: string; components?: unknown[] };

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function stepAgent(steps: { next: Step; prompts: string[] }): AgentClient {
  return {
    async runChat({ sessionId, prompt }) {
      steps.prompts.push(prompt);
      const step = steps.next;
      if (step === "ok") return { ok: true, sessionId, summary: "done", exitCode: 0 };
      if (step === "fail") return { ok: false, sessionId, summary: "boom", exitCode: 1 };
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
  cfg.github.orgs = ["corvidlabs"];
  return cfg;
}

async function runsSettled(svc: SchedulerService): Promise<void> {
  for (let i = 0; i < 200 && svc.runningIds().length > 0; i++) await Bun.sleep(5);
  expect(svc.runningIds()).toEqual([]);
}

/** Custom ids of a post's buttons, in order. */
function buttonIds(components: unknown[] | undefined): string[] {
  return ((components ?? []) as Array<{ components: Array<{ custom_id: string }> }>).flatMap((row) =>
    row.components.map((b) => b.custom_id),
  );
}
function buttonLabels(components: unknown[] | undefined): string[] {
  return ((components ?? []) as Array<{ components: Array<{ label: string }> }>).flatMap((row) =>
    row.components.map((b) => b.label),
  );
}

/**
 * One schedule and a bridge-wired scheduler (owner, channel post and owner
 * DM recorded) on one DB; `daemon` is a daemon-wired one (no outbound).
 */
function harness(
  opts: {
    db?: Database;
    channel?: string | null;
    owner?: typeof OWNER | null;
    post?: (p: Post) => Promise<void | boolean>;
    projectRoot?: string;
    project?: string;
  } = {},
) {
  const db = opts.db ?? openCorvidinhoDb({ memory: true });
  cleanups.push(() => db.close());
  const clock = { now: Date.parse("2026-09-27T10:30:00Z") };
  const store = new ScheduleStore({ db });
  const schedule = store.create({
    name: "Nightly",
    cronExpression: "0 * * * *",
    project: opts.project ?? "proj-a",
    prompt: "do thing",
    createdByUserId: CREATOR_ID,
    ...(opts.channel === null ? {} : { channelId: opts.channel ?? CHANNEL }),
    now: clock.now,
  });
  const steps: { next: Step; prompts: string[] } = { next: "ok", prompts: [] };
  const workspace = opts.projectRoot
    ? { useWorktrees: true, defaultProjectRoot: opts.projectRoot }
    : { useWorktrees: false };
  const posts: Post[] = [];
  const dms: Dm[] = [];
  const bridge = new SchedulerService({
    store,
    agent: stepAgent(steps),
    allowlist: allow([CHANNEL]),
    manual: true,
    ...workspace,
    owner: opts.owner === undefined ? OWNER : opts.owner,
    now: () => clock.now,
    outbound: {
      post: opts.post ?? (async (p) => void posts.push(p)),
      dm: async (d) => {
        dms.push(d);
        return true;
      },
    },
  });
  const daemon = new SchedulerService({
    store: new ScheduleStore({ db }),
    agent: stepAgent(steps),
    allowlist: allow([CHANNEL]),
    manual: true,
    ...workspace,
    now: () => clock.now,
  });
  /** The next cron slot comes due; `svc` ticks; the run (if any) ends as `step`. */
  async function due(step: Step, svc: SchedulerService = bridge) {
    steps.next = step;
    clock.now += HOUR;
    const r = await svc.tick();
    await runsSettled(svc);
    await bridge.settleAskDelivery();
    return r;
  }
  /** A bridge tick with nothing due. */
  async function idleTick(): Promise<void> {
    expect((await bridge.tick()).started).toEqual([]);
    await bridge.settleAskDelivery();
  }
  function row(): Record<string, unknown> {
    return db
      .query("SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(schedule.id) as Record<string, unknown>;
  }
  function runCount(): number {
    return (
      db.query("SELECT COUNT(*) AS n FROM schedule_runs WHERE schedule_id = ?").get(schedule.id) as {
        n: number;
      }
    ).n;
  }
  function scheduleRow(): { status: string; execution_count: number; next_run_at: number } {
    return db
      .query("SELECT status, execution_count, next_run_at FROM schedules WHERE id = ?")
      .get(schedule.id) as { status: string; execution_count: number; next_run_at: number };
  }
  function openRunId(): string {
    const open = store.openAsk(schedule.id);
    expect(open).toBeDefined();
    return open!.runId;
  }
  return {
    db,
    clock,
    store,
    schedule,
    steps,
    posts,
    dms,
    bridge,
    daemon,
    due,
    idleTick,
    row,
    runCount,
    scheduleRow,
    openRunId,
  };
}

function waitNote(p: { content: string }): boolean {
  return p.content.startsWith("⏸️ Schedule **Nightly**") && p.content.includes("waiting");
}

describe("a schedule's open question makes its next runs wait, with one note (AUTONOMY-6.a)", () => {
  test("a clarify ask blocks: due runs are skipped with no catch-up, no run is recorded, one note pings nobody; Cancel lets the next run go", async () => {
    const h = harness();
    expect((await h.due(CLARIFY)).started).toEqual([h.schedule.id]);
    expect(h.posts).toHaveLength(1);
    const runId = h.openRunId();
    expect(h.row()).toMatchObject({ id: runId, ask_reason: "clarify", ask_blocking: 1, ask_closed_at: null });

    // The next slot comes due: skipped, nothing runs, next_run_at moves on.
    const skipped = await h.due("ok");
    expect(skipped).toEqual({ started: [], skipped: [h.schedule.id] });
    expect(h.steps.prompts).toHaveLength(1);
    expect(h.runCount()).toBe(1);
    expect(h.scheduleRow().execution_count).toBe(1);
    expect(h.scheduleRow().next_run_at).toBe(getNextCronDate("0 * * * *", new Date(h.clock.now)).getTime());
    expect(h.scheduleRow().next_run_at).toBeGreaterThan(h.clock.now);
    // One wait note, no ping; it carries the ask's own controls (so a lost
    // ask post still leaves a way to answer or cancel it).
    expect(h.posts).toHaveLength(2);
    const note = h.posts[1]!;
    expect(waitNote(note)).toBe(true);
    expect(note.channelId).toBe(CHANNEL);
    expect(note.content).not.toContain("<@");
    expect(note.mentionUserIds ?? []).toEqual([]);
    expect(buttonLabels(note.components)).toEqual(["Answer", "Cancel"]);
    expect(buttonIds(note.components)).toEqual([openCustomId(runId), cancelCustomId(runId)]);
    expect(h.row().ask_note_at).not.toBeNull();

    // Still waiting: more due slots, no second note, nothing runs.
    await h.due("ok");
    await h.due("ok");
    await h.idleTick();
    expect(h.posts).toHaveLength(2);
    expect(h.steps.prompts).toHaveLength(1);

    // Cancel (the creator's press): the next due run goes ahead, with no answer.
    expect(h.store.closeRunAsk(runId, { outcome: "cancelled", closedBy: CREATOR_ID })).toBe(true);
    expect(h.store.openAsk(h.schedule.id)).toBeUndefined();
    // Nothing made up at once: only the next slot runs.
    await h.idleTick();
    expect(h.steps.prompts).toHaveLength(1);
    expect((await h.due("ok")).started).toEqual([h.schedule.id]);
    expect(h.steps.prompts).toHaveLength(2);
    expect(h.steps.prompts[1]).not.toContain("Human answer");
  });

  test("every recorded ask blocks: stuck, spend-cap, a run that could not start (REQ-discord-353)", async () => {
    for (const step of [STUCK, CAP_ASK] as const) {
      const h = harness();
      await h.due(step);
      expect((await h.due("ok")).started).toEqual([]);
      expect(h.posts.filter(waitNote)).toHaveLength(1);
      expect(h.steps.prompts).toHaveLength(1);
    }

    const root = mkdtempSync(join(tmpdir(), "corvidinho-ask-block-resolve-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const h = harness({ projectRoot: root, project: "missing-proj" });
    await h.due("ok");
    expect(h.row()).toMatchObject({ ask_reason: "stuck", ask_question: PROJECT_RESOLVE_FAILED_QUESTION });
    expect(h.posts).toHaveLength(1);
    // It does not keep failing (and so never reaches the auto-pause): it waits.
    for (let i = 0; i < FAILURE_AUTO_PAUSE; i++) expect((await h.due("ok")).started).toEqual([]);
    expect(h.runCount()).toBe(1);
    expect(h.scheduleRow().status).toBe("active");
    expect(h.posts.filter(waitNote)).toHaveLength(1);
  });

  test("the auto-pause ask blocks too, and /schedule resume does not close it", async () => {
    const h = harness();
    for (let i = 0; i < FAILURE_AUTO_PAUSE; i++) await h.due("fail");
    expect(h.scheduleRow().status).toBe("paused");
    expect(h.row()).toMatchObject({ ask_reason: "stuck", ask_closed_at: null });
    const runs = h.runCount();
    // /schedule resume: active again, but the pause question is still open.
    h.store.setStatus(h.schedule.id, "active", h.clock.now);
    expect(h.store.openAsk(h.schedule.id)).toBeDefined();
    expect((await h.due("ok")).started).toEqual([]);
    expect(h.runCount()).toBe(runs);
    expect(h.posts.filter(waitNote)).toHaveLength(1);
    // Answered by the owner: the next run goes.
    h.store.closeRunAsk(h.openRunId(), { outcome: "answered", answer: "Fixed the path.", closedBy: OWNER_ID });
    expect((await h.due("ok")).started).toEqual([h.schedule.id]);
  });

  test("a daemon's due run waits too; the bridge posts the ask, then the one note", async () => {
    const h = harness();
    expect((await h.due(STUCK, h.daemon)).started).toEqual([h.schedule.id]);
    expect(h.posts).toHaveLength(0);
    await h.idleTick();
    expect(h.posts).toHaveLength(1);
    expect(h.row().ask_posted_at).not.toBeNull();
    // The daemon skips the next slot (no Discord): it records the wait.
    expect((await h.due("ok", h.daemon)).started).toEqual([]);
    expect(h.row().ask_skip_at).not.toBeNull();
    expect(h.posts).toHaveLength(1);
    await h.idleTick();
    expect(h.posts).toHaveLength(2);
    expect(waitNote(h.posts[1]!)).toBe(true);
    await h.due("ok", h.daemon);
    await h.idleTick();
    expect(h.posts).toHaveLength(2);
  });
});

describe("the ask post carries its own controls (AUTONOMY-6.a)", () => {
  test("listed choices: Choose + Cancel; free text: Answer + Cancel; the hint says a reply does not answer it", async () => {
    const h = harness();
    await h.due(PICK);
    const runId = h.openRunId();
    const post = h.posts[0]!;
    expect(buttonLabels(post.components)).toEqual(["Choose", "Cancel"]);
    expect(buttonIds(post.components)).toEqual([openCustomId(runId), cancelCustomId(runId)]);
    expect(runId).toStartWith("srun_");
    expect(post.content).toContain(SCHEDULE_ASK_CHOOSE_HINT);
    expect(post.content).not.toContain(ASK_REPLY_HINT);
    expect(post.content).not.toContain(ASK_ANSWER_HINT);
    expect(h.store.openAsk(h.schedule.id)!.ask.options).toEqual(PICK.options);

    const f = harness();
    await f.due(STUCK);
    const free = f.posts[0]!;
    expect(buttonLabels(free.components)).toEqual(["Answer", "Cancel"]);
    expect(free.content).toContain(SCHEDULE_ASK_ANSWER_HINT);
    expect(free.content).not.toContain(ASK_REPLY_HINT);
    expect(free.mentionUserIds).toEqual([OWNER_ID]);
  });

  test("a spend-cap stop: Cancel only, and the post still says only that work is paused for budget (SAFE-14.a)", async () => {
    const h = harness();
    await h.due(CAP_ASK);
    const post = h.posts[0]!;
    expect(buttonLabels(post.components)).toEqual(["Cancel"]);
    expect(post.content.split("\n").slice(1)).toEqual([`${SPEND_CAP_HEADLINE} <@${OWNER_ID}>`]);
    expect(post.content).not.toMatch(/\$\d|CORVIDINHO_|daily cap/);
    // Its wait note names no amount either, and carries Cancel only.
    await h.due("ok");
    expect(waitNote(h.posts[1]!)).toBe(true);
    expect(h.posts[1]!.content).not.toMatch(/\$\d|CORVIDINHO_|cap/);
    expect(buttonLabels(h.posts[1]!.components)).toEqual(["Cancel"]);
  });

  test("an ask post that does not go out is handed back and posted by the next tick (there is no next run to post it)", async () => {
    let fail = true;
    const posts: Post[] = [];
    const h = harness({
      post: async (p) => {
        if (fail) return false;
        posts.push(p);
      },
    });
    await h.due(CLARIFY);
    expect(posts).toHaveLength(0);
    expect(h.row().ask_posted_at).toBeNull();
    fail = false;
    await h.idleTick();
    expect(posts).toHaveLength(1);
    expect(buttonLabels(posts[0]!.components)).toEqual(["Answer", "Cancel"]);
    await h.idleTick();
    expect(posts).toHaveLength(1);
  });
});

describe("an ask whose post was lost still has a way out (AUTONOMY-6.a, restarts)", () => {
  test("claimed but never posted (a crash between the claim and the post): the one wait note carries its controls, and they close it", async () => {
    const h = harness();
    // A daemon's run records the ask; a bridge claims it and dies before
    // its post goes out (ask_posted_at set, nothing in the channel).
    await h.due(PICK, h.daemon);
    const runId = h.openRunId();
    expect(h.store.claimRunAsk(runId, h.clock.now)).toBe(true);
    await h.idleTick();
    expect(h.posts).toHaveLength(0);
    // The next slot waits; the note is the only post and it can answer.
    expect((await h.due("ok")).started).toEqual([]);
    expect(h.posts).toHaveLength(1);
    expect(waitNote(h.posts[0]!)).toBe(true);
    expect(buttonLabels(h.posts[0]!.components)).toEqual(["Choose", "Cancel"]);
    expect(buttonIds(h.posts[0]!.components)).toEqual([openCustomId(runId), cancelCustomId(runId)]);
    expect(h.store.closeRunAsk(runId, { outcome: "cancelled", closedBy: CREATOR_ID })).toBe(true);
    expect((await h.due("ok")).started).toEqual([h.schedule.id]);
  });
});

describe("a schedule with no channel asks the owner by DM (AUTONOMY-6.a)", () => {
  test("the ask, its controls and the one note go to the owner's DM, never to a channel", async () => {
    const h = harness({ channel: null });
    await h.due(CLARIFY);
    expect(h.posts).toHaveLength(0);
    expect(h.dms).toHaveLength(1);
    const runId = h.openRunId();
    expect(h.dms[0]!.userId).toBe(OWNER_ID);
    expect(h.dms[0]!.content).toContain("> Postgres or SQLite?");
    expect(buttonIds(h.dms[0]!.components)).toEqual([openCustomId(runId), cancelCustomId(runId)]);
    await h.due("ok");
    expect(h.dms).toHaveLength(2);
    expect(waitNote(h.dms[1]!)).toBe(true);
    expect(h.dms[1]!.userId).toBe(OWNER_ID);
    expect(buttonIds(h.dms[1]!.components)).toEqual([openCustomId(runId), cancelCustomId(runId)]);
    await h.due("ok");
    expect(h.dms).toHaveLength(2);
    expect(h.posts).toHaveLength(0);
  });

  test("with no owner configured nothing is sent and the ask stays pending", async () => {
    const h = harness({ channel: null, owner: null });
    await h.due(STUCK);
    expect(h.dms).toHaveLength(0);
    expect(h.store.pendingAsks().map((p) => p.runId)).toEqual([h.openRunId()]);
  });
});

describe("the answer reaches the next run once (AUTONOMY-6.a, SAFE-12/13)", () => {
  test("the owner's pick reaches the next run as given, and only that run", async () => {
    const h = harness();
    await h.due(PICK);
    expect(h.store.closeRunAsk(h.openRunId(), { outcome: "picked", answer: "SQLite", closedBy: OWNER_ID })).toBe(true);
    await h.due("ok");
    const prompt = h.steps.prompts[1]!;
    expect(prompt).toContain("Prior question this schedule's last run asked");
    expect(prompt).toContain("Which database?");
    // The owner's answer is theirs: not fenced (the creator's prompt still is).
    expect(prompt).toContain("Human answer:\nSQLite\n");
    expect(prompt).not.toContain("source=ask-pick");
    await h.due("ok");
    expect(h.steps.prompts[2]).not.toContain("Human answer");
  });

  test("the creator's typed answer is scrubbed at rest and fenced as their words", async () => {
    const h = harness();
    await h.due(CLARIFY);
    const runId = h.openRunId();
    expect(
      h.store.closeRunAsk(runId, { outcome: "answered", answer: `SQLite, key ${TOKEN}`, closedBy: CREATOR_ID }),
    ).toBe(true);
    expect(h.row()).toMatchObject({
      ask_outcome: "answered",
      ask_closed_by: CREATOR_ID,
      ask_answer: "SQLite, key [redacted:github-token]",
    });
    await h.due("ok");
    const prompt = h.steps.prompts[1]!;
    expect(prompt).not.toContain(TOKEN);
    expect(prompt).toContain("[untrusted message from the acting user (role: community)");
    expect(prompt).toContain("SQLite, key [redacted:github-token]");
  });

  test("a closed ask cannot be closed again", async () => {
    const h = harness();
    await h.due(STUCK);
    const runId = h.openRunId();
    expect(h.store.closeRunAsk(runId, { outcome: "cancelled", closedBy: OWNER_ID })).toBe(true);
    expect(h.store.closeRunAsk(runId, { outcome: "answered", answer: "x", closedBy: CREATOR_ID })).toBe(false);
    expect(h.store.openRunAsk(runId)).toBeUndefined();
    expect(h.row()).toMatchObject({ ask_outcome: "cancelled", ask_closed_by: OWNER_ID, ask_answer: null });
  });
});

describe("schema v15: blocking schedule asks (forward-only migration)", () => {
  test("a v14 DB migrates to v15: the new columns exist; an ask posted before (or moot) is closed and never blocks; one still pending is posted with its controls and blocks; a re-run changes nothing", async () => {
    expect(SCHEMA_VERSION).toBe(15);
    const db = new SqliteDatabase(":memory:");
    cleanups.push(() => db.close());
    migrateCorvidinhoDb(db);
    const store = new ScheduleStore({ db });
    const mk = (name: string) =>
      store.create({
        name,
        cronExpression: "0 * * * *",
        project: "p",
        prompt: "x",
        createdByUserId: CREATOR_ID,
        channelId: CHANNEL,
      });
    // "Pending": its newest run's ask no bridge posted yet (a daemon's).
    // "Posted": its newest run's ask went out before (as text, no Cancel),
    // after an older one that never went out and is moot.
    const pending = mk("Pending");
    const posted = mk("Posted");
    // Back to v14 (main before this change).
    const v15 = [
      "ask_options",
      "ask_blocking",
      "ask_closed_at",
      "ask_outcome",
      "ask_answer",
      "ask_closed_by",
      "ask_skip_at",
      "ask_note_at",
    ];
    db.exec("DROP INDEX idx_schedule_runs_open_ask");
    for (const c of v15) db.exec(`ALTER TABLE schedule_runs DROP COLUMN ${c}`);
    db.run("UPDATE schema_meta SET value = '14' WHERE key = 'version'");
    db.run(
      `INSERT INTO schedule_runs (id, schedule_id, status, summary, started_at, completed_at, ask_reason, ask_question, ask_posted_at)
       VALUES ('srun_old000000001', ?, 'failed', 'failed (exit 1)', 1, 2, 'stuck', 'Old question?', 3),
              ('srun_old000000002', ?, 'completed', 'done', 4, 5, 'clarify', 'Newer question?', NULL),
              ('srun_old000000003', ?, 'failed', 'failed (exit 1)', 1, 2, 'stuck', 'Moot question?', NULL),
              ('srun_old000000004', ?, 'completed', 'done', 4, 5, 'clarify', 'Posted question?', 6)`,
      [pending.id, pending.id, posted.id, posted.id],
    );
    migrateCorvidinhoDb(db);
    const version = () =>
      (db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as { value: string }).value;
    expect(version()).toBe("15");
    const cols = (db.query("PRAGMA table_info(schedule_runs)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(v15));
    const rows = () =>
      db
        .query("SELECT id, ask_blocking, ask_outcome, ask_closed_at IS NOT NULL AS closed FROM schedule_runs ORDER BY id")
        .all();
    expect(rows()).toEqual([
      { id: "srun_old000000001", ask_blocking: 0, ask_outcome: "superseded", closed: 1 },
      { id: "srun_old000000002", ask_blocking: 1, ask_outcome: null, closed: 0 },
      { id: "srun_old000000003", ask_blocking: 0, ask_outcome: "superseded", closed: 1 },
      { id: "srun_old000000004", ask_blocking: 0, ask_outcome: "superseded", closed: 1 },
    ]);
    const fresh = new ScheduleStore({ db });
    expect(fresh.openAsk(posted.id)).toBeUndefined();
    expect(fresh.openRunAsk("srun_old000000004")).toBeUndefined();
    expect(fresh.openAsk(pending.id)?.runId).toBe("srun_old000000002");
    expect(fresh.pendingAsks().map((p) => p.runId)).toEqual(["srun_old000000002"]);
    const before = rows();
    migrateCorvidinhoDb(db);
    expect(version()).toBe("15");
    expect(rows()).toEqual(before);

    // Both come due: the schedule whose old question went out runs; the one
    // whose question was still pending waits, and that question is posted
    // now with Answer + Cancel, then the one wait note.
    const posts: Post[] = [];
    const steps: { next: Step; prompts: string[] } = { next: "ok", prompts: [] };
    db.run("UPDATE schedules SET next_run_at = ?", [Date.now() - 1000]);
    const svc = new SchedulerService({
      store: fresh,
      agent: stepAgent(steps),
      allowlist: allow([CHANNEL]),
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      outbound: { post: async (p) => void posts.push(p) },
    });
    expect(await svc.tick()).toEqual({ started: [posted.id], skipped: [pending.id] });
    await runsSettled(svc);
    await svc.settleAskDelivery();
    const ask = posts.find((p) => p.content.includes("Newer question?"));
    expect(ask).toBeDefined();
    expect(buttonLabels(ask!.components)).toEqual(["Answer", "Cancel"]);
    expect(buttonIds(ask!.components)).toEqual([
      openCustomId("srun_old000000002"),
      cancelCustomId("srun_old000000002"),
    ]);
    expect(posts.filter((p) => p.content.startsWith("⏸️ Schedule **Pending**"))).toHaveLength(1);
    expect(posts.filter((p) => p.content.startsWith("✅ Schedule **Posted**"))).toHaveLength(1);
    expect(posts.some((p) => /Old question|Moot question|Posted question/.test(p.content))).toBe(false);
    expect(posts).toHaveLength(3);
  });

  test("the answer and the listed choices are re-scrub targets (SAFE-6)", async () => {
    expect(SCRUB_TARGETS).toContainEqual({
      table: "schedule_runs",
      columns: ["summary", "error", "ask_question", "ask_answer"],
      json: ["ask_options"],
    });
    const h = harness();
    await h.due(PICK);
    const runId = h.openRunId();
    // Rows written by an older build (or before a rules change).
    h.db.run("UPDATE schedule_runs SET ask_options = ?, ask_answer = ? WHERE id = ?", [
      JSON.stringify([{ id: "pg", label: `use ${TOKEN}` }, { id: "lite", label: "SQLite" }]),
      `token ${TOKEN}`,
      runId,
    ]);
    expect(rescrubDatabase(h.db).byTable.schedule_runs).toBe(1);
    const r = h.row();
    expect(String(r.ask_answer)).toBe("token [redacted:github-token]");
    expect(JSON.parse(String(r.ask_options))).toEqual([
      { id: "pg", label: "use [redacted:github-token]" },
      { id: "lite", label: "SQLite" },
    ]);
  });
});
