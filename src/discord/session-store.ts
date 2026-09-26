/**
 * In-memory session stub maps (DISCORD-1 / 2 / 2.a).
 * No ProcessManager; no durable DB required for thin slice (optional later).
 */

import type { SessionStub } from "./types.ts";

function newId(): string {
  return `sess_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export class SessionStore {
  /** bot reply message id → session */
  readonly byBotMessageId = new Map<string, SessionStub>();
  /** thread id → session */
  readonly byThreadId = new Map<string, SessionStub>();
  /** session id → session */
  readonly bySessionId = new Map<string, SessionStub>();

  create(opts: {
    channelId: string;
    userId: string;
    threadId?: string;
    topic?: string;
    id?: string;
  }): SessionStub {
    const now = Date.now();
    const session: SessionStub = {
      id: opts.id ?? newId(),
      channelId: opts.channelId,
      threadId: opts.threadId,
      userId: opts.userId,
      topic: opts.topic,
      createdAt: now,
      lastActivityAt: now,
    };
    this.bySessionId.set(session.id, session);
    if (session.threadId) {
      this.byThreadId.set(session.threadId, session);
    }
    return session;
  }

  touch(session: SessionStub): void {
    session.lastActivityAt = Date.now();
  }

  /** Bind a bot outbound message id so replies continue the session (DISCORD-2). */
  trackBotMessage(botMessageId: string, session: SessionStub): void {
    this.byBotMessageId.set(botMessageId, session);
  }

  getByBotMessage(botMessageId: string): SessionStub | undefined {
    return this.byBotMessageId.get(botMessageId);
  }

  getByThread(threadId: string): SessionStub | undefined {
    return this.byThreadId.get(threadId);
  }

  get(sessionId: string): SessionStub | undefined {
    return this.bySessionId.get(sessionId);
  }

  /** Active sessions newest-first (slash /session list). */
  list(): SessionStub[] {
    return [...this.bySessionId.values()].sort(
      (a, b) => b.lastActivityAt - a.lastActivityAt,
    );
  }
}
