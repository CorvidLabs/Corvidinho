/**
 * In-memory work-task stubs for /work (DISCORD-4).
 * No ProcessManager / no durable WorkTaskService — thin agent-ops surface.
 */

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

export class WorkStore {
  readonly byId = new Map<string, WorkTaskStub>();

  create(opts: {
    description: string;
    userId: string;
    channelId: string;
    sessionId?: string;
    id?: string;
  }): WorkTaskStub {
    const now = Date.now();
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
    return task;
  }

  setStatus(task: WorkTaskStub, status: WorkTaskStatus, summary?: string): void {
    task.status = status;
    task.updatedAt = Date.now();
    if (summary !== undefined) task.summary = summary;
  }

  list(): WorkTaskStub[] {
    return [...this.byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  countByStatus(status: WorkTaskStatus): number {
    let n = 0;
    for (const t of this.byId.values()) {
      if (t.status === status) n += 1;
    }
    return n;
  }
}
