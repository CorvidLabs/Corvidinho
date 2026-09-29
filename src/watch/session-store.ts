/**
 * WATCH session stubs keyed by owner/repo#number, with optional SQLite
 * durability (`watch_sessions`) and the same soft TTL as Discord sessions
 * (SESSION-1..3 / REQ-watch-037). Without a db the store is in-memory only
 * (tests). No ProcessManager. The thread's condensed conversation, replayed
 * into follow-ups, is kept apart per issue/PR (`conversation_threads`,
 * REQ-watch-472; the poller writes it), so it outlives the session's TTL.
 */

import type { Database } from "bun:sqlite";
import { scrubOpt } from "../store/scrub.ts";
import { isSessionExpired, resolveSessionTtlMs } from "../store/session-ttl.ts";
import type { SessionStub } from "./types.ts";

function newId(): string {
  return `wsess_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function issueKey(repo: string, number: number): string {
  return `${repo.toLowerCase()}#${number}`;
}

export type WatchSessionStoreOptions = {
  /** When set, persist/reload from the shared Corvidinho DB. */
  db?: Database;
  /** Soft TTL ms (SESSION-2). Default from env / 45m. */
  ttlMs?: number;
  /** Injectable clock (tests). */
  now?: () => number;
};

type WatchSessionRow = {
  id: string;
  repo: string;
  number: number;
  user_id: string;
  topic: string | null;
  created_at: number;
  last_activity_at: number;
};

export class SessionStore {
  readonly byIssueKey = new Map<string, SessionStub>();
  readonly bySessionId = new Map<string, SessionStub>();

  private readonly db: Database | undefined;
  readonly ttlMs: number;
  private readonly now: () => number;

  constructor(opts: WatchSessionStoreOptions = {}) {
    this.db = opts.db;
    this.ttlMs = opts.ttlMs ?? resolveSessionTtlMs();
    this.now = opts.now ?? (() => Date.now());
    if (this.db) this.loadFromDb();
  }

  /** True when the store persists to SQLite. */
  get durable(): boolean {
    return this.db !== undefined;
  }

  private expired(session: SessionStub): boolean {
    return isSessionExpired(session.lastActivityAt, {
      ttlMs: this.ttlMs,
      nowMs: this.now(),
    });
  }

  /** Drop an idle-past-TTL session from maps + DB; true when purged. */
  private purgeIfExpired(session: SessionStub | undefined): boolean {
    if (!session || !this.expired(session)) return false;
    this.remove(session);
    return true;
  }

  private remove(session: SessionStub): void {
    this.bySessionId.delete(session.id);
    const key = issueKey(session.repo, session.number);
    if (this.byIssueKey.get(key)?.id === session.id) this.byIssueKey.delete(key);
    this.db?.run(`DELETE FROM watch_sessions WHERE id = ?`, [session.id]);
  }

  private loadFromDb(): void {
    if (!this.db) return;
    const now = this.now();
    const rows = this.db
      .query(
        `SELECT id, repo, number, user_id, topic, created_at, last_activity_at
         FROM watch_sessions`,
      )
      .all() as WatchSessionRow[];
    for (const row of rows) {
      if (
        isSessionExpired(row.last_activity_at, { ttlMs: this.ttlMs, nowMs: now })
      ) {
        this.db.run(`DELETE FROM watch_sessions WHERE id = ?`, [row.id]);
        continue;
      }
      const session: SessionStub = {
        id: row.id,
        repo: row.repo,
        number: row.number,
        userId: row.user_id,
        topic: row.topic ?? undefined,
        createdAt: row.created_at,
        lastActivityAt: row.last_activity_at,
      };
      this.bySessionId.set(session.id, session);
      this.byIssueKey.set(issueKey(session.repo, session.number), session);
    }
  }

  /**
   * Upsert the session row. Another process on the same DB (e.g. a second
   * watcher) may have replaced this issue's row with its own session; the
   * latest write wins so the UNIQUE issue_key never throws mid-cycle.
   */
  private persist(session: SessionStub): void {
    const db = this.db;
    if (!db) return;
    const key = issueKey(session.repo, session.number);
    db.transaction(() => {
      db.run(`DELETE FROM watch_sessions WHERE issue_key = ? AND id != ?`, [
        key,
        session.id,
      ]);
      db.run(
        `INSERT INTO watch_sessions
          (id, issue_key, repo, number, user_id, topic, created_at, last_activity_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           issue_key = excluded.issue_key,
           repo = excluded.repo,
           number = excluded.number,
           user_id = excluded.user_id,
           topic = excluded.topic,
           created_at = excluded.created_at,
           last_activity_at = excluded.last_activity_at`,
        [
          session.id,
          key,
          session.repo,
          session.number,
          session.userId,
          scrubOpt(session.topic),
          session.createdAt,
          session.lastActivityAt,
        ],
      );
    })();
  }

  /**
   * Start a fresh session for an issue. Any prior session for the same
   * owner/repo#number is superseded (one session per issue key).
   */
  create(opts: {
    repo: string;
    number: number;
    userId: string;
    topic?: string;
    id?: string;
  }): SessionStub {
    const now = this.now();
    const session: SessionStub = {
      id: opts.id ?? newId(),
      repo: opts.repo,
      number: opts.number,
      userId: opts.userId,
      topic: opts.topic,
      createdAt: now,
      lastActivityAt: now,
    };
    const key = issueKey(session.repo, session.number);
    const prior = this.byIssueKey.get(key);
    if (prior && prior.id !== session.id) this.remove(prior);
    // persist() also clears a stale row for this issue that was never loaded
    // (e.g. written by another process) so the UNIQUE issue_key holds.
    this.bySessionId.set(session.id, session);
    this.byIssueKey.set(key, session);
    this.persist(session);
    return session;
  }

  /** Activity keep-alive (SESSION-2): refresh lastActivityAt and persist. */
  touch(session: SessionStub): void {
    session.lastActivityAt = this.now();
    // Never resurrect a session that was purged or superseded.
    if (this.bySessionId.get(session.id) === session) this.persist(session);
  }

  /** Live session for an issue; undefined when none or idle past TTL. */
  getByIssue(repo: string, number: number): SessionStub | undefined {
    const session = this.byIssueKey.get(issueKey(repo, number));
    if (this.purgeIfExpired(session)) return undefined;
    return session;
  }

  get(sessionId: string): SessionStub | undefined {
    const session = this.bySessionId.get(sessionId);
    if (this.purgeIfExpired(session)) return undefined;
    return session;
  }

  /** Active (non-expired) sessions newest-first. */
  list(): SessionStub[] {
    const out: SessionStub[] = [];
    for (const session of [...this.bySessionId.values()]) {
      if (this.purgeIfExpired(session)) continue;
      out.push(session);
    }
    return out.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }
}
