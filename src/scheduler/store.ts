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
import type { HumanAsk, HumanAskReason } from "../agent/types.ts";
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

/** The ask as stored on a run row: reason + scrubbed, capped question. */
function storedAsk(ask: HumanAsk): HumanAsk {
  const q = scrubSecrets(ask.question).trim();
  return {
    reason: ask.reason,
    question: q.length <= ASK_QUESTION_MAX ? q : `${q.slice(0, ASK_QUESTION_MAX - 1)}…`,
  };
}

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
   */
  markRunFinished(
    schedule: Schedule,
    run: ScheduleRun,
    result: { ok: boolean; summary?: string; error?: string; ask?: HumanAsk },
    now = Date.now(),
  ): void {
    const status: ScheduleRunStatus = result.ok ? "completed" : "failed";
    let failures = result.ok ? 0 : schedule.consecutiveFailures + 1;
    // AUTONOMY-2 / AUTONOMOUS-7: the ask stays pending until a bridge posts it.
    const ask = result.ask ? storedAsk(result.ask) : undefined;
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
          db.run(
            `UPDATE schedule_runs SET status = ?, summary = ?, error = ?, completed_at = ?,
               ask_reason = ?, ask_question = ?, ask_posted_at = NULL
             WHERE id = ?`,
            [
              status,
              scrubOpt(result.summary),
              scrubOpt(result.error),
              now,
              ask?.reason ?? null,
              ask?.question ?? null,
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
      const newest = new Map<string, ScheduleRun>();
      for (const r of this.runsMemory.values()) {
        if (r.completedAt === undefined) continue;
        const cur = newest.get(r.scheduleId);
        if (!cur || r.completedAt >= cur.completedAt!) newest.set(r.scheduleId, r);
      }
      return [...newest.values()]
        .filter((r) => r.ask && r.askPostedAt === undefined)
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
        `SELECT r.id, r.schedule_id, r.summary, r.ask_reason, r.ask_question
         FROM schedule_runs r
         WHERE r.ask_reason IS NOT NULL AND r.ask_posted_at IS NULL
           AND r.completed_at IS NOT NULL
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
    }>;
    const pending: PendingScheduleAsk[] = [];
    for (const r of rows) {
      if (!ASK_REASONS.has(r.ask_reason) || !r.ask_question) continue;
      pending.push({
        runId: r.id,
        scheduleId: r.schedule_id,
        ask: { reason: r.ask_reason as HumanAskReason, question: r.ask_question },
        ...(r.summary !== null ? { summary: r.summary } : {}),
      });
    }
    return pending;
  }

  /**
   * Take a run's pending ask to post it: a compare-and-set on
   * `ask_posted_at IS NULL`, so a bridge and another ticker on one data dir
   * never both post it. False when the run has no ask or it was taken.
   */
  claimRunAsk(runId: string, now = Date.now()): boolean {
    const run = this.runsMemory.get(runId);
    if (this.db) {
      const res = this.db.run(
        `UPDATE schedule_runs SET ask_posted_at = ?
         WHERE id = ? AND ask_reason IS NOT NULL AND ask_posted_at IS NULL`,
        [now, runId],
      );
      if (res.changes === 0) return false;
    } else if (!run?.ask || run.askPostedAt !== undefined) {
      return false;
    }
    if (run) run.askPostedAt = now;
    return true;
  }

  /** Hand a claimed ask back (its post did not go out): the next tick retries. */
  releaseRunAsk(runId: string): void {
    this.db?.run("UPDATE schedule_runs SET ask_posted_at = NULL WHERE id = ?", [runId]);
    const run = this.runsMemory.get(runId);
    if (run) run.askPostedAt = undefined;
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
