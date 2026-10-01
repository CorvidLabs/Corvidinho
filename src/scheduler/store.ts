/**
 * ScheduleStore — SQLite-backed recurring schedules (DISCORD-SCHEDULE).
 * Steal shape from corvid-agent server/db/schedules.ts (thin single-project).
 *
 * The bridge and `corvidinho daemon` may share one data dir (CLI-8 /
 * AUTONOMOUS-4): tickers `refresh()` from SQLite, `claimRun()` a due run with
 * a compare-and-set so it fires once, and every update writes only the
 * columns it owns so one process never overwrites another's pause/resume or
 * run counters with a stale cached row.
 */

import type { Database } from "bun:sqlite";
import { getNextCronDate } from "./cron.ts";
import { ASK_QUESTION_MAX } from "../agent/ask.ts";
import { resolveAskOptions } from "../agent/ask-options.ts";
import type { AskOption, HumanAsk, HumanAskReason } from "../agent/types.ts";
import { isHolderAlive, readProcStart } from "../daemon/lock.ts";
import { scrubOpt, scrubSecrets } from "../store/scrub.ts";

/** Error recorded on a run a dead process left "running" (REQ-discord-346). */
export const RUN_INTERRUPTED_BY_RESTART = "interrupted: process restarted";

/**
 * Identity of the process that runs a schedule run: `<pid>:<Linux /proc start
 * time>`, so a recycled pid never passes for the process that died.
 */
export function scheduleRunnerId(pid: number = process.pid): string {
  return `${pid}:${readProcStart(pid) ?? ""}`;
}

/** True while the process a runner id names still runs (same start time). */
export function isScheduleRunnerAlive(runner: string): boolean {
  const [pidText, procStart] = runner.split(":");
  return isHolderAlive({
    pid: Number(pidText),
    startedAt: "",
    procStart: procStart ? procStart : null,
  });
}

export type ScheduleStatus = "active" | "paused";

export type Schedule = {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  project: string;
  prompt: string;
  channelId?: string;
  createdByUserId: string;
  status: ScheduleStatus;
  executionCount: number;
  consecutiveFailures: number;
  lastRunAt?: number;
  nextRunAt?: number;
  createdAt: number;
  updatedAt: number;
  /**
   * Digest of the question the owner was last pinged about (AUTONOMY-2):
   * the same question pings once until a run succeeds, the schedule is
   * paused/resumed, or the question changes.
   */
  askPingKey?: string;
};

export type ScheduleRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type ScheduleRun = {
  id: string;
  scheduleId: string;
  status: ScheduleRunStatus;
  summary?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
  /**
   * The ask the run stopped with (AUTONOMY-2 / AUTONOMOUS-7): reason and the
   * SAFE-6 scrubbed question, capped at ASK_QUESTION_MAX.
   */
  ask?: HumanAsk;
  /** When a bridge took the ask to post it; unset while it is pending. */
  askPostedAt?: number;
  /**
   * AUTONOMY-6.a (schema v15): when the ask was answered or cancelled on
   * Discord (or closed at the v15 upgrade); unset while it is open and the
   * schedule's due runs wait on it.
   */
  askClosedAt?: number;
  /** How the ask closed (AUTONOMY-6.a). */
  askOutcome?: ScheduleAskOutcome;
  /** The answer handed to the schedule's next run (SAFE-6 scrubbed). */
  askAnswer?: string;
  /** Discord user id of whoever answered or cancelled it. */
  askClosedBy?: string;
  /** When a due run first waited on this ask (AUTONOMY-6.a). */
  askSkipAt?: number;
  /** When the one wait note about it went out (AUTONOMY-6.a). */
  askNoteAt?: number;
};

/**
 * How a schedule run's ask closed (AUTONOMY-6.a): `answered` (typed in the
 * private Answer form), `picked` (one of its listed choices), `cancelled`,
 * or `superseded` (recorded before schema v15, closed by the upgrade).
 */
/** `continued`: the owner's Continue on a spend-cap stop (AUTONOMY-8); like `cancelled`, no answer is handed on. */
export type ScheduleAskOutcome = "answered" | "picked" | "cancelled" | "continued" | "superseded";

/** A schedule run's ask that is still open (AUTONOMY-6.a). */
export type OpenScheduleAsk = {
  runId: string;
  scheduleId: string;
  /** Reason, scrubbed question and its listed choices (if any). */
  ask: HumanAsk;
  /** When a bridge took it to post it; unset while it is pending. */
  postedAt?: number;
  /** When a due run first waited on it. */
  skipAt?: number;
  /** When the one wait note went out. */
  noteAt?: number;
};

/** The answer the schedule's next run gets (AUTONOMY-6.a). */
export type AnsweredScheduleAsk = {
  runId: string;
  question: string;
  answer: string;
  outcome: "answered" | "picked";
  /** Discord user id of whoever answered. */
  closedBy: string;
};

/**
 * A finished run's ask no bridge has posted yet (REQ-discord-347): the run
 * was claimed by a ticker with no Discord (`corvidinho daemon`).
 */
export type PendingScheduleAsk = {
  runId: string;
  scheduleId: string;
  ask: HumanAsk;
  /** The run's recorded summary (context line for a stuck ask). */
  summary?: string;
};

const ASK_REASONS: ReadonlySet<string> = new Set<HumanAskReason>([
  "clarify",
  "stuck",
  "spend-cap",
]);

/**
 * The ask as stored on a run row: reason + scrubbed, capped question, and
 * (AUTONOMY-6.a) the choices its Choose button lists — ask-human's options,
 * else a numbered list in the question (`resolveAskOptions`, labels SAFE-6
 * scrubbed before they are cut). A spend-cap stop lists none: only Cancel
 * answers it.
 */
function storedAsk(ask: HumanAsk): HumanAsk {
  const q = scrubSecrets(ask.question).trim();
  const question = q.length <= ASK_QUESTION_MAX ? q : `${q.slice(0, ASK_QUESTION_MAX - 1)}…`;
  const options =
    ask.reason === "spend-cap"
      ? undefined
      : resolveAskOptions({ options: ask.options, question });
  return { reason: ask.reason, question, ...(options?.length ? { options } : {}) };
}

/** Stored `ask_options` JSON → the listed choices (bad or empty ⇒ none). */
function parseStoredOptions(raw: string | null | undefined): AskOption[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const out = parsed.filter(
      (o): o is AskOption =>
        !!o && typeof o === "object" && typeof o.id === "string" && typeof o.label === "string",
    );
    return out.length ? out.map((o) => ({ id: o.id, label: o.label })) : undefined;
  } catch {
    return undefined;
  }
}

type OpenAskRow = {
  id: string;
  schedule_id: string;
  ask_reason: string;
  ask_question: string | null;
  ask_options: string | null;
  ask_posted_at: number | null;
  ask_skip_at: number | null;
  ask_note_at: number | null;
};

function rowToOpenAsk(r: OpenAskRow): OpenScheduleAsk | undefined {
  if (!ASK_REASONS.has(r.ask_reason) || !r.ask_question) return undefined;
  const options = parseStoredOptions(r.ask_options);
  return {
    runId: r.id,
    scheduleId: r.schedule_id,
    ask: {
      reason: r.ask_reason as HumanAskReason,
      question: r.ask_question,
      ...(options ? { options } : {}),
    },
    ...(r.ask_posted_at !== null ? { postedAt: r.ask_posted_at } : {}),
    ...(r.ask_skip_at !== null ? { skipAt: r.ask_skip_at } : {}),
    ...(r.ask_note_at !== null ? { noteAt: r.ask_note_at } : {}),
  };
}

/** Memory store: the run recorded an ask nobody closed yet. */
function memoryAskOpen(r: ScheduleRun): boolean {
  return r.ask !== undefined && r.completedAt !== undefined && r.askClosedAt === undefined;
}

/** Memory store: a run's open ask. */
function memoryOpenAsk(r: ScheduleRun): OpenScheduleAsk {
  return {
    runId: r.id,
    scheduleId: r.scheduleId,
    ask: { ...r.ask!, ...(r.ask!.options ? { options: r.ask!.options.map((o) => ({ ...o })) } : {}) },
    ...(r.askPostedAt !== undefined ? { postedAt: r.askPostedAt } : {}),
    ...(r.askSkipAt !== undefined ? { skipAt: r.askSkipAt } : {}),
    ...(r.askNoteAt !== undefined ? { noteAt: r.askNoteAt } : {}),
  };
}

const OPEN_ASK_COLUMNS =
  "r.id, r.schedule_id, r.ask_reason, r.ask_question, r.ask_options, r.ask_posted_at, r.ask_skip_at, r.ask_note_at";

/**
 * SQL (run row alias `r`): the run's ask is open and blocks its schedule
 * (AUTONOMY-6.a) — recorded under v15 rules, not closed, and on the
 * schedule's newest finished run. A later finished run (another ticker's,
 * past the wait) makes an older ask moot, as it does for delivery
 * (REQ-discord-347), so a moot ask never blocks.
 */
const OPEN_ASK_WHERE = `r.ask_blocking = 1 AND r.ask_closed_at IS NULL
  AND r.ask_reason IS NOT NULL AND r.completed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM schedule_runs l
    WHERE l.schedule_id = r.schedule_id AND l.completed_at IS NOT NULL
      AND (l.completed_at > r.completed_at
           OR (l.completed_at = r.completed_at AND l.rowid > r.rowid))
  )`;

export type CreateScheduleInput = {
  name: string;
  cronExpression: string;
  project: string;
  prompt: string;
  channelId?: string;
  createdByUserId: string;
  description?: string;
  now?: number;
};

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

type ScheduleRow = {
  id: string;
  name: string;
  description: string;
  cron_expression: string;
  project: string;
  prompt: string;
  channel_id: string | null;
  created_by_user_id: string;
  status: string;
  execution_count: number;
  consecutive_failures: number;
  last_run_at: number | null;
  next_run_at: number | null;
  created_at: number;
  updated_at: number;
  ask_ping_key?: string | null;
};

function rowToSchedule(r: ScheduleRow): Schedule {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    cronExpression: r.cron_expression,
    project: r.project,
    prompt: r.prompt,
    channelId: r.channel_id ?? undefined,
    createdByUserId: r.created_by_user_id,
    status: r.status as ScheduleStatus,
    executionCount: r.execution_count,
    consecutiveFailures: r.consecutive_failures,
    lastRunAt: r.last_run_at ?? undefined,
    nextRunAt: r.next_run_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    askPingKey: r.ask_ping_key ?? undefined,
  };
}

/**
 * In-memory or SQLite schedule store. Without db: memory Map (tests).
 */
export class ScheduleStore {
  private memory = new Map<string, Schedule>();
  private runsMemory = new Map<string, ScheduleRun>();
  private readonly db?: Database;
  /** Recorded on each run this store claims (REQ-discord-346). */
  private readonly runner: string;

  constructor(opts: { db?: Database; runner?: string } = {}) {
    this.db = opts.db;
    this.runner = opts.runner ?? scheduleRunnerId();
    this.refresh();
  }

  /** Runs live in SQLite (they outlive this process); false for memory. */
  get durable(): boolean {
    return this.db !== undefined;
  }

  /**
   * Re-read schedules from SQLite so rows another process created, paused,
   * resumed, deleted or ran are seen (bridge + daemon on one data dir).
   * Cached objects are updated in place, so an in-flight run keeps the live
   * object. No-op for the in-memory store.
   */
  refresh(): void {
    if (!this.db) return;
    const rows = this.db
      .query("SELECT * FROM schedules ORDER BY created_at ASC")
      .all() as ScheduleRow[];
    const seen = new Set<string>();
    for (const r of rows) {
      seen.add(r.id);
      const fresh = rowToSchedule(r);
      const cached = this.memory.get(r.id);
      if (cached) Object.assign(cached, fresh);
      else this.memory.set(r.id, fresh);
    }
    for (const id of [...this.memory.keys()]) {
      if (!seen.has(id)) this.memory.delete(id);
    }
  }

  list(): Schedule[] {
    return [...this.memory.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  get(id: string): Schedule | undefined {
    return this.memory.get(id);
  }

  /** Exact id or unique prefix match. */
  resolve(idOrPrefix: string): Schedule | undefined {
    const exact = this.memory.get(idOrPrefix);
    if (exact) return exact;
    const matches = [...this.memory.values()].filter((s) =>
      s.id.startsWith(idOrPrefix),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  create(input: CreateScheduleInput): Schedule {
    const now = input.now ?? Date.now();
    const next = getNextCronDate(input.cronExpression, new Date(now)).getTime();
    const schedule: Schedule = {
      id: newId("sched"),
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      cronExpression: input.cronExpression,
      project: input.project.trim(),
      prompt: input.prompt.trim(),
      channelId: input.channelId?.trim() || undefined,
      createdByUserId: input.createdByUserId,
      status: "active",
      executionCount: 0,
      consecutiveFailures: 0,
      nextRunAt: next,
      createdAt: now,
      updatedAt: now,
    };
    this.memory.set(schedule.id, schedule);
    this.persistInsert(schedule);
    return schedule;
  }

  private persistInsert(s: Schedule): void {
    if (!this.db) return;
    this.db.run(
      `INSERT INTO schedules (
        id, name, description, cron_expression, project, prompt, channel_id,
        created_by_user_id, status, execution_count, consecutive_failures,
        last_run_at, next_run_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id,
        scrubSecrets(s.name),
        scrubSecrets(s.description),
        s.cronExpression,
        s.project,
        scrubSecrets(s.prompt),
        s.channelId ?? null,
        s.createdByUserId,
        s.status,
        s.executionCount,
        s.consecutiveFailures,
        s.lastRunAt ?? null,
        s.nextRunAt ?? null,
        s.createdAt,
        s.updatedAt,
      ],
    );
  }

  setStatus(id: string, status: ScheduleStatus, now = Date.now()): Schedule | undefined {
    const s = this.memory.get(id);
    if (!s) return undefined;
    s.status = status;
    s.updatedAt = now;
    if (status === "active") {
      s.nextRunAt = getNextCronDate(s.cronExpression, new Date(now)).getTime();
    }
    // Pause/resume re-arms the owner ping (AUTONOMY-2 dedupe).
    s.askPingKey = undefined;
    // Only the columns this mutation owns — never a stale full row.
    this.db?.run(
      "UPDATE schedules SET status = ?, next_run_at = ?, updated_at = ?, ask_ping_key = NULL WHERE id = ?",
      [s.status, s.nextRunAt ?? null, s.updatedAt, s.id],
    );
    return s;
  }

  /**
   * Record (or clear with `null`) the digest of the question the owner was
   * last pinged about for this schedule (AUTONOMY-2 dedupe). Writes only
   * that column.
   */
  setAskPingKey(id: string, key: string | null): void {
    const s = this.memory.get(id);
    if (s) s.askPingKey = key ?? undefined;
    this.db?.run("UPDATE schedules SET ask_ping_key = ? WHERE id = ?", [
      key,
      id,
    ]);
  }

  delete(id: string): boolean {
    if (!this.memory.has(id)) return false;
    this.memory.delete(id);
    if (this.db) {
      this.db.run("DELETE FROM schedule_runs WHERE schedule_id = ?", [id]);
      this.db.run("DELETE FROM schedules WHERE id = ?", [id]);
    }
    return true;
  }

  /** Active schedules with next_run_at <= now. */
  listDue(now = Date.now()): Schedule[] {
    return this.list().filter(
      (s) =>
        s.status === "active" &&
        s.nextRunAt !== undefined &&
        s.nextRunAt <= now,
    );
  }

  /**
   * Claim a due run for this process: advances next_run_at only when the row
   * is still active with the next_run_at this process last saw. Returns null
   * when another ticker on the same data dir already claimed it, or it was
   * paused/deleted meanwhile — so each due run fires exactly once.
   */
  claimRun(schedule: Schedule, now = Date.now()): ScheduleRun | null {
    // Advance next_run before work so we do not double-fire if tick overlaps.
    const next = getNextCronDate(
      schedule.cronExpression,
      new Date(now),
    ).getTime();
    if (this.db) {
      const res = this.db.run(
        `UPDATE schedules SET last_run_at = ?,
           execution_count = execution_count + 1, next_run_at = ?, updated_at = ?
         WHERE id = ? AND status = 'active' AND next_run_at IS ?`,
        [now, next, now, schedule.id, schedule.nextRunAt ?? null],
      );
      if (res.changes === 0) {
        // Lost the race (or paused/deleted elsewhere): pick up the new row.
        this.refresh();
        return null;
      }
    } else if (schedule.status !== "active") {
      return null;
    }
    const run: ScheduleRun = {
      id: newId("srun"),
      scheduleId: schedule.id,
      status: "running",
      startedAt: now,
    };
    this.runsMemory.set(run.id, run);
    schedule.lastRunAt = now;
    schedule.executionCount += 1;
    schedule.updatedAt = now;
    schedule.nextRunAt = next;
    if (this.db) {
      this.db.run(
        `INSERT INTO schedule_runs (id, schedule_id, status, summary, error, started_at, completed_at, runner)
         VALUES (?, ?, ?, NULL, NULL, ?, NULL, ?)`,
        [run.id, run.scheduleId, run.status, run.startedAt, this.runner],
      );
    }
    return run;
  }

  /**
   * Record a run's outcome. The SQLite writes run in one IMMEDIATE
   * transaction: the write lock is taken up front (so busy_timeout applies)
   * and an attempt that throws (SQLITE_BUSY) changes nothing, so the
   * scheduler can retry it without counting a failure twice. The cached
   * run/schedule are updated only after the write succeeds.
   *
   * `autoPause` (REQ-discord-353, AUTONOMY-2): when this failure makes
   * `autoPause.at` or more failures in a row — counted in the same
   * transaction, so every writer agrees — the run row stores
   * `autoPause.ask` instead of `result.ask`, so the ask about the pause is
   * pending as soon as the outcome is.
   */
  markRunFinished(
    schedule: Schedule,
    run: ScheduleRun,
    result: {
      ok: boolean;
      summary?: string;
      error?: string;
      ask?: HumanAsk;
      autoPause?: { at: number; ask: HumanAsk };
    },
    now = Date.now(),
  ): void {
    const status: ScheduleRunStatus = result.ok ? "completed" : "failed";
    let failures = result.ok ? 0 : schedule.consecutiveFailures + 1;
    // AUTONOMY-2 / AUTONOMOUS-7: the ask stays pending until a bridge posts it.
    const askFor = (count: number): HumanAsk | undefined => {
      const pausing = !result.ok && result.autoPause && count >= result.autoPause.at;
      const chosen = pausing ? result.autoPause!.ask : result.ask;
      return chosen ? storedAsk(chosen) : undefined;
    };
    let ask = askFor(failures);
    const db = this.db;
    if (db) {
      failures = db
        .transaction(() => {
          // Count in SQL, not from the cached row, so every writer agrees.
          db.run(
            `UPDATE schedules SET
               consecutive_failures = CASE WHEN ? = 1 THEN 0 ELSE consecutive_failures + 1 END,
               updated_at = ?
             WHERE id = ?`,
            [result.ok ? 1 : 0, now, schedule.id],
          );
          const row = db
            .query("SELECT consecutive_failures FROM schedules WHERE id = ?")
            .get(schedule.id) as { consecutive_failures: number } | null;
          ask = askFor(row ? row.consecutive_failures : failures);
          // AUTONOMY-6.a: every recorded ask blocks the schedule until it
          // is answered or cancelled (schema v15).
          db.run(
            `UPDATE schedule_runs SET status = ?, summary = ?, error = ?, completed_at = ?,
               ask_reason = ?, ask_question = ?, ask_posted_at = NULL,
               ask_options = ?, ask_blocking = ?, ask_closed_at = NULL, ask_outcome = NULL,
               ask_answer = NULL, ask_closed_by = NULL, ask_skip_at = NULL, ask_note_at = NULL
             WHERE id = ?`,
            [
              status,
              scrubOpt(result.summary),
              scrubOpt(result.error),
              now,
              ask?.reason ?? null,
              ask?.question ?? null,
              ask?.options ? JSON.stringify(ask.options) : null,
              ask ? 1 : 0,
              run.id,
            ],
          );
          return row ? row.consecutive_failures : failures;
        })
        .immediate();
    }
    run.status = status;
    run.summary = result.summary;
    run.error = result.error;
    run.completedAt = now;
    run.ask = ask;
    run.askPostedAt = undefined;
    run.askClosedAt = undefined;
    run.askOutcome = undefined;
    run.askAnswer = undefined;
    run.askClosedBy = undefined;
    run.askSkipAt = undefined;
    run.askNoteAt = undefined;
    schedule.consecutiveFailures = failures;
    schedule.updatedAt = now;
  }

  /**
   * Needs-human outbox (REQ-discord-347, AUTONOMY-2 / AUTONOMOUS-7): for each
   * schedule whose newest finished run stopped with an ask no bridge has
   * posted, that ask. An older pending ask is moot once a later run of the
   * schedule finished, and a deleted schedule's runs are gone, so a stale
   * question is never returned. Oldest first.
   */
  pendingAsks(): PendingScheduleAsk[] {
    if (!this.db) {
      return [...this.newestFinishedRunsMemory().values()]
        .filter((r) => r.ask && r.askPostedAt === undefined && r.askClosedAt === undefined)
        .sort((a, b) => a.completedAt! - b.completedAt!)
        .map((r) => ({
          runId: r.id,
          scheduleId: r.scheduleId,
          ask: { ...r.ask! },
          ...(r.summary !== undefined ? { summary: r.summary } : {}),
        }));
    }
    const rows = this.db
      .query(
        `SELECT r.id, r.schedule_id, r.summary, r.ask_reason, r.ask_question, r.ask_options
         FROM schedule_runs r
         WHERE r.ask_reason IS NOT NULL AND r.ask_posted_at IS NULL
           AND r.ask_closed_at IS NULL AND r.completed_at IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM schedule_runs l
             WHERE l.schedule_id = r.schedule_id AND l.completed_at IS NOT NULL
               AND (l.completed_at > r.completed_at
                    OR (l.completed_at = r.completed_at AND l.rowid > r.rowid))
           )
         ORDER BY r.completed_at ASC, r.rowid ASC`,
      )
      .all() as Array<{
      id: string;
      schedule_id: string;
      summary: string | null;
      ask_reason: string;
      ask_question: string | null;
      ask_options: string | null;
    }>;
    const pending: PendingScheduleAsk[] = [];
    for (const r of rows) {
      if (!ASK_REASONS.has(r.ask_reason) || !r.ask_question) continue;
      const options = parseStoredOptions(r.ask_options);
      pending.push({
        runId: r.id,
        scheduleId: r.schedule_id,
        ask: {
          reason: r.ask_reason as HumanAskReason,
          question: r.ask_question,
          ...(options ? { options } : {}),
        },
        ...(r.summary !== null ? { summary: r.summary } : {}),
      });
    }
    return pending;
  }

  /**
   * Take a run's pending ask to post it: a compare-and-set on
   * `ask_posted_at IS NULL`, so a bridge and another ticker on one data dir
   * never both post it. The same write re-checks that the run is still its
   * schedule's newest finished run, so an ask a later run made moot after
   * `pendingAsks()` listed it is never taken (REQ-discord-347). False when
   * the run has no ask, it was taken, or it is moot.
   */
  claimRunAsk(runId: string, now = Date.now()): boolean {
    const run = this.runsMemory.get(runId);
    if (this.db) {
      const res = this.db.run(
        `UPDATE schedule_runs SET ask_posted_at = ?
         WHERE id = ? AND ask_reason IS NOT NULL AND ask_posted_at IS NULL
           AND ask_closed_at IS NULL AND completed_at IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM schedule_runs l
             WHERE l.schedule_id = schedule_runs.schedule_id
               AND l.completed_at IS NOT NULL
               AND (l.completed_at > schedule_runs.completed_at
                    OR (l.completed_at = schedule_runs.completed_at
                        AND l.rowid > schedule_runs.rowid))
           )`,
        [now, runId],
      );
      if (res.changes === 0) return false;
    } else if (
      !run?.ask ||
      run.askPostedAt !== undefined ||
      run.askClosedAt !== undefined ||
      this.newestFinishedRunsMemory().get(run.scheduleId) !== run
    ) {
      return false;
    }
    if (run) run.askPostedAt = now;
    return true;
  }

  /** Memory store: each schedule's newest finished run (ties: the later one). */
  private newestFinishedRunsMemory(): Map<string, ScheduleRun> {
    const newest = new Map<string, ScheduleRun>();
    for (const r of this.runsMemory.values()) {
      if (r.completedAt === undefined) continue;
      const cur = newest.get(r.scheduleId);
      if (!cur || r.completedAt >= cur.completedAt!) newest.set(r.scheduleId, r);
    }
    return newest;
  }

  /** Hand a claimed ask back (its post did not go out): the next tick retries. */
  releaseRunAsk(runId: string): void {
    this.db?.run("UPDATE schedule_runs SET ask_posted_at = NULL WHERE id = ?", [runId]);
    const run = this.runsMemory.get(runId);
    if (run) run.askPostedAt = undefined;
  }

  /**
   * AUTONOMY-6.a — the schedule's open ask: the ask its newest finished run
   * recorded, while nobody has answered or cancelled it. While it is open
   * the schedule's due runs wait.
   */
  openAsk(scheduleId: string): OpenScheduleAsk | undefined {
    if (this.db) {
      const row = this.db
        .query(
          `SELECT ${OPEN_ASK_COLUMNS} FROM schedule_runs r
           WHERE r.schedule_id = ? AND ${OPEN_ASK_WHERE}
           LIMIT 1`,
        )
        .get(scheduleId) as OpenAskRow | null;
      return row ? rowToOpenAsk(row) : undefined;
    }
    const newest = this.newestFinishedRunsMemory().get(scheduleId);
    return newest && memoryAskOpen(newest) ? memoryOpenAsk(newest) : undefined;
  }

  /**
   * AUTONOMY-6.a — a run's ask by run id (the id its Discord controls carry),
   * while it is open; undefined when the run has no ask, it closed, a later
   * run of its schedule finished, or the run (or its schedule) is gone.
   */
  openRunAsk(runId: string): OpenScheduleAsk | undefined {
    if (this.db) {
      const row = this.db
        .query(`SELECT ${OPEN_ASK_COLUMNS} FROM schedule_runs r WHERE r.id = ? AND ${OPEN_ASK_WHERE}`)
        .get(runId) as OpenAskRow | null;
      return row ? rowToOpenAsk(row) : undefined;
    }
    const run = this.runsMemory.get(runId);
    if (!run || !memoryAskOpen(run)) return undefined;
    if (this.newestFinishedRunsMemory().get(run.scheduleId) !== run) return undefined;
    return memoryOpenAsk(run);
  }

  /**
   * AUTONOMY-6.a — close a run's open ask: answered (typed or picked, with
   * the answer SAFE-6 scrubbed for the next run), cancelled, or continued
   * (the owner's Continue on a spend-cap stop, AUTONOMY-8: no answer), by
   * `closedBy`.
   * A compare-and-set on `ask_closed_at IS NULL`, so two presses (or two
   * processes) close it once. False when it was not open.
   */
  closeRunAsk(
    runId: string,
    close: { outcome: "answered" | "picked" | "cancelled" | "continued"; answer?: string; closedBy: string },
    now = Date.now(),
  ): boolean {
    const answer =
      close.outcome === "cancelled" || close.outcome === "continued" ? null : scrubSecrets(close.answer ?? "");
    const run = this.runsMemory.get(runId);
    if (this.db) {
      const res = this.db.run(
        `UPDATE schedule_runs SET ask_closed_at = ?, ask_outcome = ?, ask_answer = ?, ask_closed_by = ?
         WHERE id = ? AND ask_blocking = 1 AND ask_closed_at IS NULL AND ask_reason IS NOT NULL`,
        [now, close.outcome, answer, close.closedBy, runId],
      );
      if (res.changes === 0) return false;
    } else if (!run?.ask || run.askClosedAt !== undefined) {
      return false;
    }
    if (run) {
      run.askClosedAt = now;
      run.askOutcome = close.outcome;
      run.askAnswer = answer ?? undefined;
      run.askClosedBy = close.closedBy;
    }
    return true;
  }

  /**
   * AUTONOMY-6.a — a due run that waits on the schedule's open ask: it is
   * skipped with no catch-up. Like `claimRun`, a compare-and-set moves
   * `next_run_at` to the next cron time only when the row is still active
   * with the `next_run_at` this process last saw (so two tickers skip it
   * once), but no run is recorded and the run counters stay. The open ask
   * gets `ask_skip_at` the first time, which lets a bridge post the one
   * wait note. False when another ticker got there first.
   */
  skipForOpenAsk(schedule: Schedule, ask: OpenScheduleAsk, now = Date.now()): boolean {
    const next = getNextCronDate(schedule.cronExpression, new Date(now)).getTime();
    if (this.db) {
      const db = this.db;
      const changed = db
        .transaction(() => {
          const res = db.run(
            `UPDATE schedules SET next_run_at = ?, updated_at = ?
             WHERE id = ? AND status = 'active' AND next_run_at IS ?`,
            [next, now, schedule.id, schedule.nextRunAt ?? null],
          );
          if (res.changes === 0) return false;
          db.run(
            `UPDATE schedule_runs SET ask_skip_at = ?
             WHERE id = ? AND ask_skip_at IS NULL AND ask_closed_at IS NULL`,
            [now, ask.runId],
          );
          return true;
        })
        .immediate();
      if (!changed) {
        this.refresh();
        return false;
      }
    } else if (schedule.status !== "active") {
      return false;
    }
    schedule.nextRunAt = next;
    schedule.updatedAt = now;
    const run = this.runsMemory.get(ask.runId);
    if (run && run.askSkipAt === undefined && run.askClosedAt === undefined) run.askSkipAt = now;
    return true;
  }

  /**
   * AUTONOMY-6.a — open asks that made a due run wait, were posted, and have
   * had no wait note yet: the one note a bridge posts per ask. Oldest first.
   */
  pendingWaitNotes(): OpenScheduleAsk[] {
    if (!this.db) {
      return [...this.newestFinishedRunsMemory().values()]
        .filter(
          (r) =>
            memoryAskOpen(r) &&
            r.askSkipAt !== undefined &&
            r.askPostedAt !== undefined &&
            r.askNoteAt === undefined,
        )
        .sort((a, b) => a.askSkipAt! - b.askSkipAt!)
        .map((r) => memoryOpenAsk(r));
    }
    const rows = this.db
      .query(
        `SELECT ${OPEN_ASK_COLUMNS} FROM schedule_runs r
         WHERE ${OPEN_ASK_WHERE}
           AND r.ask_skip_at IS NOT NULL AND r.ask_posted_at IS NOT NULL AND r.ask_note_at IS NULL
         ORDER BY r.ask_skip_at ASC, r.rowid ASC`,
      )
      .all() as OpenAskRow[];
    return rows.flatMap((r) => rowToOpenAsk(r) ?? []);
  }

  /**
   * AUTONOMY-6.a — take an open ask's wait note to post it: a
   * compare-and-set on `ask_note_at IS NULL`, so it goes out once across
   * tickers. False when it was taken, or the ask closed meanwhile.
   */
  claimWaitNote(runId: string, now = Date.now()): boolean {
    const run = this.runsMemory.get(runId);
    if (this.db) {
      const res = this.db.run(
        `UPDATE schedule_runs SET ask_note_at = ?
         WHERE id = ? AND ask_note_at IS NULL AND ask_closed_at IS NULL AND ask_skip_at IS NOT NULL`,
        [now, runId],
      );
      if (res.changes === 0) return false;
    } else if (
      !run ||
      run.askNoteAt !== undefined ||
      run.askClosedAt !== undefined ||
      run.askSkipAt === undefined
    ) {
      return false;
    }
    if (run) run.askNoteAt = now;
    return true;
  }

  /** Hand a taken wait note back (its post did not go out): the next tick retries. */
  releaseWaitNote(runId: string): void {
    this.db?.run("UPDATE schedule_runs SET ask_note_at = NULL WHERE id = ?", [runId]);
    const run = this.runsMemory.get(runId);
    if (run) run.askNoteAt = undefined;
  }

  /**
   * AUTONOMY-6.a — the answer the schedule's next run gets: the newest
   * finished run's ask, when it closed answered (typed or picked). Once a
   * later run of the schedule finishes it is no longer the newest, so the
   * answer reaches one run only.
   */
  answeredAsk(scheduleId: string): AnsweredScheduleAsk | undefined {
    if (this.db) {
      const row = this.db
        .query(
          `SELECT id, ask_question, ask_answer, ask_outcome, ask_closed_by FROM schedule_runs
           WHERE schedule_id = ? AND completed_at IS NOT NULL
           ORDER BY completed_at DESC, rowid DESC LIMIT 1`,
        )
        .get(scheduleId) as {
        id: string;
        ask_question: string | null;
        ask_answer: string | null;
        ask_outcome: string | null;
        ask_closed_by: string | null;
      } | null;
      if (
        !row ||
        (row.ask_outcome !== "answered" && row.ask_outcome !== "picked") ||
        !row.ask_question ||
        !row.ask_answer ||
        !row.ask_closed_by
      ) {
        return undefined;
      }
      return {
        runId: row.id,
        question: row.ask_question,
        answer: row.ask_answer,
        outcome: row.ask_outcome,
        closedBy: row.ask_closed_by,
      };
    }
    const run = this.newestFinishedRunsMemory().get(scheduleId);
    if (
      !run?.ask ||
      (run.askOutcome !== "answered" && run.askOutcome !== "picked") ||
      !run.askAnswer ||
      !run.askClosedBy
    ) {
      return undefined;
    }
    return {
      runId: run.id,
      question: run.ask.question,
      answer: run.askAnswer,
      outcome: run.askOutcome,
      closedBy: run.askClosedBy,
    };
  }

  /**
   * Restart recovery (REQ-discord-346 / SESSION-WORKTREE-3): a run left
   * "running" by a process that is gone (kill -9, crash, a stop that could
   * not record it) can never finish. Mark it failed with
   * `interrupted: process restarted` instead of showing it running forever.
   * A run whose runner process still lives (another bridge or daemon on this
   * data dir) is left alone. Rows from before runners were recorded count as
   * gone. Only the run row changes; the schedule's counters do not. No-op for
   * the in-memory store. Call at start, before this process ticks.
   */
  recoverAbandonedRuns(
    now = Date.now(),
    isAlive: (runner: string) => boolean = isScheduleRunnerAlive,
  ): ScheduleRun[] {
    if (!this.db) return [];
    const rows = this.db
      .query(
        "SELECT id, schedule_id, started_at, runner FROM schedule_runs WHERE status = 'running'",
      )
      .all() as Array<{
      id: string;
      schedule_id: string;
      started_at: number;
      runner: string | null;
    }>;
    const recovered: ScheduleRun[] = [];
    for (const r of rows) {
      if (r.runner && isAlive(r.runner)) continue;
      const res = this.db.run(
        `UPDATE schedule_runs SET status = 'failed', error = ?, completed_at = ?
         WHERE id = ? AND status = 'running'`,
        [RUN_INTERRUPTED_BY_RESTART, now, r.id],
      );
      if (res.changes === 0) continue;
      recovered.push({
        id: r.id,
        scheduleId: r.schedule_id,
        status: "failed",
        error: RUN_INTERRUPTED_BY_RESTART,
        startedAt: r.started_at,
        completedAt: now,
      });
    }
    return recovered;
  }

  /**
   * Status and schedule of a run by id (SQLite first, then this process's
   * memory), or undefined when this data dir has no such run (another data
   * dir's run, or its schedule was deleted).
   */
  runRecord(
    runId: string,
  ): { status: ScheduleRunStatus; scheduleId: string } | undefined {
    if (this.db) {
      const row = this.db
        .query("SELECT status, schedule_id FROM schedule_runs WHERE id = ?")
        .get(runId) as { status: string; schedule_id: string } | null;
      if (row) {
        return {
          status: row.status as ScheduleRunStatus,
          scheduleId: row.schedule_id,
        };
      }
    }
    const run = this.runsMemory.get(runId);
    return run ? { status: run.status, scheduleId: run.scheduleId } : undefined;
  }
}
