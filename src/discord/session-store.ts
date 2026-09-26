/**
 * Discord session stub maps (DISCORD-1 / 2 / 2.a) with optional SQLite
 * durability + soft TTL (SESSION-1..4 / REQ-discord-019).
 * No ProcessManager.
 */

import type { Database } from "bun:sqlite";
import {
  isSessionExpired,
  resolveSessionTtlMs,
  SESSION_TTL_DEFAULT_MS,
} from "../store/session-ttl.ts";
import type { SessionStub } from "./types.ts";

function newId(): string {
  return `sess_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export type SessionStoreOptions = {
  /** When set, persist/reload from shared Corvidinho DB. */
  db?: Database;
  /** Soft TTL ms (SESSION-2). Default from env / 45m. */
  ttlMs?: number;
  /** Injectable clock (tests). */
  now?: () => number;
};

export class SessionStore {
  /** bot reply message id → session */
  readonly byBotMessageId = new Map<string, SessionStub>();
  /** thread id → session */
  readonly byThreadId = new Map<string, SessionStub>();
  /** session id → session */
  readonly bySessionId = new Map<string, SessionStub>();

  private readonly db: Database | undefined;
  readonly ttlMs: number;
  private readonly now: () => number;

  constructor(opts: SessionStoreOptions = {}) {
    this.db = opts.db;
    this.ttlMs = opts.ttlMs ?? resolveSessionTtlMs();
    this.now = opts.now ?? (() => Date.now());
    if (this.db) {
      this.loadFromDb();
    }
  }

  private nowMs(): number {
    return this.now();
  }

  private expired(session: SessionStub): boolean {
    return isSessionExpired(session.lastActivityAt, {
      ttlMs: this.ttlMs,
      nowMs: this.nowMs(),
    });
  }

  /** Drop expired session from maps + DB; return true if purged. */
  private purgeIfExpired(session: SessionStub | undefined): boolean {
    if (!session) return false;
    if (!this.expired(session)) return false;
    this.removeLocal(session);
    this.deleteFromDb(session.id);
    return true;
  }

  private removeLocal(session: SessionStub): void {
    this.bySessionId.delete(session.id);
    if (session.threadId) {
      const mapped = this.byThreadId.get(session.threadId);
      if (mapped?.id === session.id) this.byThreadId.delete(session.threadId);
    }
    for (const [botId, s] of [...this.byBotMessageId.entries()]) {
      if (s.id === session.id) this.byBotMessageId.delete(botId);
    }
  }

  private loadFromDb(): void {
    if (!this.db) return;
    const now = this.nowMs();
    const sessions = this.db
      .query(
        `SELECT id, channel_id, thread_id, user_id, topic, created_at, last_activity_at
         FROM discord_sessions`,
      )
      .all() as Array<{
      id: string;
      channel_id: string;
      thread_id: string | null;
      user_id: string;
      topic: string | null;
      created_at: number;
      last_activity_at: number;
    }>;

    for (const row of sessions) {
      if (
        isSessionExpired(row.last_activity_at, {
          ttlMs: this.ttlMs,
          nowMs: now,
        })
      ) {
        this.deleteFromDb(row.id);
        continue;
      }
      const session: SessionStub = {
        id: row.id,
        channelId: row.channel_id,
        threadId: row.thread_id ?? undefined,
        userId: row.user_id,
        topic: row.topic ?? undefined,
        createdAt: row.created_at,
        lastActivityAt: row.last_activity_at,
      };
      this.bySessionId.set(session.id, session);
      if (session.threadId) {
        this.byThreadId.set(session.threadId, session);
      }
    }

    const bots = this.db
      .query(
        `SELECT bot_message_id, session_id FROM discord_session_bot_messages`,
      )
      .all() as Array<{ bot_message_id: string; session_id: string }>;
    for (const row of bots) {
      const session = this.bySessionId.get(row.session_id);
      if (!session) {
        this.db.run(
          `DELETE FROM discord_session_bot_messages WHERE bot_message_id = ?`,
          [row.bot_message_id],
        );
        continue;
      }
      this.byBotMessageId.set(row.bot_message_id, session);
    }
  }

  private persistSession(session: SessionStub): void {
    if (!this.db) return;
    this.db.run(
      `INSERT INTO discord_sessions
        (id, channel_id, thread_id, user_id, topic, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         channel_id = excluded.channel_id,
         thread_id = excluded.thread_id,
         user_id = excluded.user_id,
         topic = excluded.topic,
         created_at = excluded.created_at,
         last_activity_at = excluded.last_activity_at`,
      [
        session.id,
        session.channelId,
        session.threadId ?? null,
        session.userId,
        session.topic ?? null,
        session.createdAt,
        session.lastActivityAt,
      ],
    );
  }

  private persistBotMessage(botMessageId: string, sessionId: string): void {
    if (!this.db) return;
    this.db.run(
      `INSERT INTO discord_session_bot_messages (bot_message_id, session_id)
       VALUES (?, ?)
       ON CONFLICT(bot_message_id) DO UPDATE SET session_id = excluded.session_id`,
      [botMessageId, sessionId],
    );
  }

  private deleteFromDb(sessionId: string): void {
    if (!this.db) return;
    this.db.run(
      `DELETE FROM discord_session_bot_messages WHERE session_id = ?`,
      [sessionId],
    );
    this.db.run(`DELETE FROM discord_sessions WHERE id = ?`, [sessionId]);
  }

  create(opts: {
    channelId: string;
    userId: string;
    threadId?: string;
    topic?: string;
    id?: string;
  }): SessionStub {
    const now = this.nowMs();
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
    this.persistSession(session);
    return session;
  }

  touch(session: SessionStub): void {
    session.lastActivityAt = this.nowMs();
    this.persistSession(session);
  }

  /** Bind a bot outbound message id so replies continue the session (DISCORD-2). */
  trackBotMessage(botMessageId: string, session: SessionStub): void {
    this.byBotMessageId.set(botMessageId, session);
    this.persistBotMessage(botMessageId, session.id);
  }

  getByBotMessage(botMessageId: string): SessionStub | undefined {
    const session = this.byBotMessageId.get(botMessageId);
    if (this.purgeIfExpired(session)) return undefined;
    return session;
  }

  getByThread(threadId: string): SessionStub | undefined {
    const session = this.byThreadId.get(threadId);
    if (this.purgeIfExpired(session)) return undefined;
    return session;
  }

  get(sessionId: string): SessionStub | undefined {
    const session = this.bySessionId.get(sessionId);
    if (this.purgeIfExpired(session)) return undefined;
    return session;
  }

  /** Active (non-expired) sessions newest-first (slash /session list). */
  list(): SessionStub[] {
    const out: SessionStub[] = [];
    for (const session of [...this.bySessionId.values()]) {
      if (this.purgeIfExpired(session)) continue;
      out.push(session);
    }
    return out.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }
}

export { SESSION_TTL_DEFAULT_MS };
