/**
 * Work-task stubs for /work (DISCORD-4) with optional SQLite durability
 * (REQ-discord-019). No ProcessManager / no /schedule in this slice.
 */

import type { Database } from "bun:sqlite";
import { scrubOpt, scrubSecrets } from "../store/scrub.ts";

export type WorkTaskStatus = "queued" | "running" | "completed" | "failed";

export type WorkTaskStub = {
  id: string;
  description: string;
  userId: string;
  channelId: string;
  sessionId?: string;
  status: WorkTaskStatus;
  createdAt: number;
  updatedAt: number;
  summary?: string;
};

function newId(): string {
  return `work_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

const STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "completed",
  "failed",
]);

export type WorkStoreOptions = {
  db?: Database;
  now?: () => number;
};

export class WorkStore {
  readonly byId = new Map<string, WorkTaskStub>();
  private readonly db: Database | undefined;
  private readonly now: () => number;

  constructor(opts: WorkStoreOptions = {}) {
    this.db = opts.db;
    this.now = opts.now ?? (() => Date.now());
    if (this.db) this.loadFromDb();
  }

  private loadFromDb(): void {
    if (!this.db) return;
    const rows = this.db
      .query(
        `SELECT id, description, user_id, channel_id, session_id, status,
                created_at, updated_at, summary
         FROM discord_work_tasks`,
      )
      .all() as Array<{
      id: string;
      description: string;
      user_id: string;
      channel_id: string;
      session_id: string | null;
      status: string;
      created_at: number;
      updated_at: number;
      summary: string | null;
    }>;
    for (const row of rows) {
      if (!STATUSES.has(row.status)) continue;
      const task: WorkTaskStub = {
        id: row.id,
        description: row.description,
        userId: row.user_id,
        channelId: row.channel_id,
        sessionId: row.session_id ?? undefined,
        status: row.status as WorkTaskStatus,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        summary: row.summary ?? undefined,
      };
      this.byId.set(task.id, task);
    }
  }

  private persist(task: WorkTaskStub): void {
    if (!this.db) return;
    this.db.run(
      `INSERT INTO discord_work_tasks
        (id, description, user_id, channel_id, session_id, status, created_at, updated_at, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         description = excluded.description,
         user_id = excluded.user_id,
         channel_id = excluded.channel_id,
         session_id = excluded.session_id,
         status = excluded.status,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         summary = excluded.summary`,
      [
        task.id,
        scrubSecrets(task.description),
        task.userId,
        task.channelId,
        task.sessionId ?? null,
        task.status,
        task.createdAt,
        task.updatedAt,
        scrubOpt(task.summary),
      ],
    );
  }

  create(opts: {
    description: string;
    userId: string;
    channelId: string;
    sessionId?: string;
    id?: string;
  }): WorkTaskStub {
    const now = this.now();
    const task: WorkTaskStub = {
      id: opts.id ?? newId(),
      description: opts.description,
      userId: opts.userId,
      channelId: opts.channelId,
      sessionId: opts.sessionId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(task.id, task);
    this.persist(task);
    return task;
  }

  setStatus(task: WorkTaskStub, status: WorkTaskStatus, summary?: string): void {
    task.status = status;
    task.updatedAt = this.now();
    if (summary !== undefined) task.summary = summary;
    this.persist(task);
  }

  list(): WorkTaskStub[] {
    return [...this.byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Restart recovery (SESSION-WORKTREE-3 hygiene): work left queued/running by
   * a process that died can never finish. Mark it failed with an honest
   * summary instead of showing it "running" forever. No resume (the durable
   * queue is draft AUTONOMOUS-14). Call once at bridge start, before new work.
   */
  recoverAbandoned(): WorkTaskStub[] {
    const recovered: WorkTaskStub[] = [];
    for (const task of this.byId.values()) {
      if (task.status !== "queued" && task.status !== "running") continue;
      const was = task.status;
      this.setStatus(
        task,
        "failed",
        `abandoned: the bridge restarted while this work was ${was}; it was not resumed`,
      );
      recovered.push(task);
    }
    return recovered;
  }

  countByStatus(status: WorkTaskStatus): number {
    let n = 0;
    for (const t of this.byId.values()) {
      if (t.status === status) n += 1;
    }
    return n;
  }
}
