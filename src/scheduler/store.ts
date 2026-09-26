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
import { scrubOpt, scrubSecrets } from "../store/scrub.ts";

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
};

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

  constructor(opts: { db?: Database } = {}) {
    this.db = opts.db;
    this.refresh();
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
        `INSERT INTO schedule_runs (id, schedule_id, status, summary, error, started_at, completed_at)
         VALUES (?, ?, ?, NULL, NULL, ?, NULL)`,
        [run.id, run.scheduleId, run.status, run.startedAt],
      );
    }
    return run;
  }

  markRunFinished(
    schedule: Schedule,
    run: ScheduleRun,
    result: { ok: boolean; summary?: string; error?: string },
    now = Date.now(),
  ): void {
    run.status = result.ok ? "completed" : "failed";
    run.summary = result.summary;
    run.error = result.error;
    run.completedAt = now;
    if (result.ok) {
      schedule.consecutiveFailures = 0;
    } else {
      schedule.consecutiveFailures += 1;
    }
    schedule.updatedAt = now;
    if (this.db) {
      // Count in SQL, not from the cached row, so every writer agrees.
      this.db.run(
        `UPDATE schedules SET
           consecutive_failures = CASE WHEN ? = 1 THEN 0 ELSE consecutive_failures + 1 END,
           updated_at = ?
         WHERE id = ?`,
        [result.ok ? 1 : 0, now, schedule.id],
      );
      const row = this.db
        .query("SELECT consecutive_failures FROM schedules WHERE id = ?")
        .get(schedule.id) as { consecutive_failures: number } | null;
      if (row) schedule.consecutiveFailures = row.consecutive_failures;
      this.db.run(
        `UPDATE schedule_runs SET status = ?, summary = ?, error = ?, completed_at = ?
         WHERE id = ?`,
        [
          run.status,
          scrubOpt(run.summary),
          scrubOpt(run.error),
          run.completedAt,
          run.id,
        ],
      );
    }
  }
}
