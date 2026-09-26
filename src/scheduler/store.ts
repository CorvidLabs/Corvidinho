/**
 * ScheduleStore — SQLite-backed recurring schedules (DISCORD-SCHEDULE).
 * Steal shape from corvid-agent server/db/schedules.ts (thin single-project).
 */

import type { Database } from "bun:sqlite";
import { getNextCronDate } from "./cron.ts";

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
    if (this.db) this.loadFromDb();
  }

  private loadFromDb(): void {
    if (!this.db) return;
    const rows = this.db
      .query("SELECT * FROM schedules ORDER BY created_at ASC")
      .all() as ScheduleRow[];
    this.memory.clear();
    for (const r of rows) this.memory.set(r.id, rowToSchedule(r));
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
        s.name,
        s.description,
        s.cronExpression,
        s.project,
        s.prompt,
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

  private persistUpdate(s: Schedule): void {
    if (!this.db) return;
    this.db.run(
      `UPDATE schedules SET
        name = ?, description = ?, cron_expression = ?, project = ?, prompt = ?,
        channel_id = ?, status = ?, execution_count = ?, consecutive_failures = ?,
        last_run_at = ?, next_run_at = ?, updated_at = ?
      WHERE id = ?`,
      [
        s.name,
        s.description,
        s.cronExpression,
        s.project,
        s.prompt,
        s.channelId ?? null,
        s.status,
        s.executionCount,
        s.consecutiveFailures,
        s.lastRunAt ?? null,
        s.nextRunAt ?? null,
        s.updatedAt,
        s.id,
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
    this.persistUpdate(s);
    return s;
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

  markRunStarted(
    schedule: Schedule,
    now = Date.now(),
  ): ScheduleRun {
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
    // Advance next_run before work so we do not double-fire if tick overlaps.
    schedule.nextRunAt = getNextCronDate(
      schedule.cronExpression,
      new Date(now),
    ).getTime();
    this.persistUpdate(schedule);
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
    this.persistUpdate(schedule);
    if (this.db) {
      this.db.run(
        `UPDATE schedule_runs SET status = ?, summary = ?, error = ?, completed_at = ?
         WHERE id = ?`,
        [
          run.status,
          run.summary ?? null,
          run.error ?? null,
          run.completedAt,
          run.id,
        ],
      );
    }
  }
}
