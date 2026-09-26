/**
 * Discord session stub maps (DISCORD-1 / 2 / 2.a) with optional SQLite
 * durability + soft TTL (SESSION-1..4 / REQ-discord-019) and per-talk
 * worktree isolation (SESSION-WORKTREE-1..5 / REQ-discord-022).
 * No ProcessManager.
 */

import type { Database } from "bun:sqlite";
import type { AllowlistConfig } from "../allowlist/types.ts";
import { scrubOpt } from "../store/scrub.ts";
import {
  isSessionExpired,
  resolveSessionTtlMs,
  SESSION_TTL_DEFAULT_MS,
} from "../store/session-ttl.ts";
import {
  ensureTalkWorkspace,
  parkWorktree,
  resolveProjectDir,
  type TalkWorkspace,
} from "../worktree/index.ts";
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
  /**
   * Default project root for talks that do not pass an explicit project
   * (SESSION-WORKTREE-4). Usually the bridge projectRoot.
   */
  defaultProjectRoot?: string;
  /**
   * Bridge allowlist: its GitHub repo list gates an explicit project outside
   * `defaultProjectRoot` (REQ-discord-202). Absent ⇒ such projects refused.
   */
  allowlist?: AllowlistConfig;
  /**
   * When true (default), create an isolated worktree/scoped dir on session
   * create for repo work. Tests may disable.
   */
  ensureWorktree?: boolean;
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
  readonly defaultProjectRoot: string | undefined;
  private readonly allowlist: AllowlistConfig | undefined;
  private readonly ensureWorktreeOnCreate: boolean;

  constructor(opts: SessionStoreOptions = {}) {
    this.db = opts.db;
    this.ttlMs = opts.ttlMs ?? resolveSessionTtlMs();
    this.now = opts.now ?? (() => Date.now());
    this.defaultProjectRoot = opts.defaultProjectRoot;
    this.allowlist = opts.allowlist;
    this.ensureWorktreeOnCreate = opts.ensureWorktree === true;
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

  /** Drop expired session from maps + DB; park worktree async; return true if purged. */
  private purgeIfExpired(session: SessionStub | undefined): boolean {
    if (!session) return false;
    if (!this.expired(session)) return false;
    // Sync drop so lookups never return expired; park async (SESSION-WORKTREE-3).
    void this.parkSessionWorktree(session);
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
        `SELECT id, channel_id, thread_id, user_id, topic, project,
                worktree_path, worktree_branch, worktree_state,
                created_at, last_activity_at
         FROM discord_sessions`,
      )
      .all() as Array<{
      id: string;
      channel_id: string;
      thread_id: string | null;
      user_id: string;
      topic: string | null;
      project: string | null;
      worktree_path: string | null;
      worktree_branch: string | null;
      worktree_state: string | null;
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
        // Park leftover worktree then delete (SESSION-WORKTREE-3)
        const doomed: SessionStub = {
          id: row.id,
          channelId: row.channel_id,
          threadId: row.thread_id ?? undefined,
          userId: row.user_id,
          topic: row.topic ?? undefined,
          project: row.project ?? undefined,
          worktreePath: row.worktree_path ?? undefined,
          worktreeBranch: row.worktree_branch ?? undefined,
          worktreeState: (row.worktree_state as SessionStub["worktreeState"]) ??
            undefined,
          createdAt: row.created_at,
          lastActivityAt: row.last_activity_at,
        };
        void this.parkSessionWorktree(doomed);
        this.deleteFromDb(row.id);
        continue;
      }
      const session: SessionStub = {
        id: row.id,
        channelId: row.channel_id,
        threadId: row.thread_id ?? undefined,
        userId: row.user_id,
        topic: row.topic ?? undefined,
        project: row.project ?? undefined,
        worktreePath: row.worktree_path ?? undefined,
        worktreeBranch: row.worktree_branch ?? undefined,
        worktreeState: (row.worktree_state as SessionStub["worktreeState"]) ??
          undefined,
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
        (id, channel_id, thread_id, user_id, topic, project,
         worktree_path, worktree_branch, worktree_state,
         created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         channel_id = excluded.channel_id,
         thread_id = excluded.thread_id,
         user_id = excluded.user_id,
         topic = excluded.topic,
         project = excluded.project,
         worktree_path = excluded.worktree_path,
         worktree_branch = excluded.worktree_branch,
         worktree_state = excluded.worktree_state,
         created_at = excluded.created_at,
         last_activity_at = excluded.last_activity_at`,
      [
        session.id,
        session.channelId,
        session.threadId ?? null,
        session.userId,
        scrubOpt(session.topic),
        session.project ?? null,
        session.worktreePath ?? null,
        session.worktreeBranch ?? null,
        session.worktreeState ?? null,
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

  /** Park/remove worktree so another talk cannot reuse it as cwd. */
  async parkSessionWorktree(session: SessionStub): Promise<void> {
    if (!session.worktreePath || !session.project) {
      session.worktreeState = "removed";
      return;
    }
    if (session.worktreeState === "parked" || session.worktreeState === "removed") {
      return;
    }
    const state = await parkWorktree(session.project, session.worktreePath, {
      kind: session.worktreeBranch ? "worktree" : "scoped_dir",
      branchName: session.worktreeBranch,
    });
    session.worktreeState = state;
    session.worktreePath = undefined;
  }

  /**
   * End/abandon a talk: park worktree, drop from maps + DB (SESSION-WORKTREE-3).
   */
  async endSession(session: SessionStub): Promise<void> {
    await this.parkSessionWorktree(session);
    this.removeLocal(session);
    this.deleteFromDb(session.id);
  }

  /**
   * Bind an isolated workspace onto a session (idempotent if already bound).
   * Never silently switches project mid-conversation (SESSION-WORKTREE-4).
   */
  async bindWorktree(
    session: SessionStub,
    opts?: { project?: string },
  ): Promise<{ ok: true; workspace: TalkWorkspace } | { ok: false; error: string }> {
    if (session.worktreePath && session.worktreeState === "active") {
      // Already bound — refuse silent project switch
      if (opts?.project?.trim()) {
        const resolved = resolveProjectDir(opts.project, {
          defaultProjectRoot: session.project ?? this.defaultProjectRoot ?? process.cwd(),
          github: this.allowlist?.github,
        });
        if (!resolved.ok) {
          return { ok: false, error: resolved.error };
        }
        if (session.project && resolved.dir !== session.project) {
          return {
            ok: false,
            error: `project already set to ${session.project}; refusing mid-conversation switch`,
          };
        }
      }
      return {
        ok: true,
        workspace: {
          kind: session.worktreeBranch ? "worktree" : "scoped_dir",
          workDir: session.worktreePath,
          projectWorkingDir: session.project ?? session.worktreePath,
          branchName: session.worktreeBranch,
          worktreeId: session.id,
          state: "active",
        },
      };
    }

    const defaultRoot =
      this.defaultProjectRoot ?? session.project ?? process.cwd();
    const resolved = resolveProjectDir(opts?.project ?? session.project, {
      defaultProjectRoot: defaultRoot,
      github: this.allowlist?.github,
    });
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }

    const ensured = await ensureTalkWorkspace({
      projectWorkingDir: resolved.dir,
      sessionId: session.id,
    });
    if (!ensured.ok) {
      return { ok: false, error: ensured.error };
    }

    session.project = ensured.workspace.projectWorkingDir;
    session.worktreePath = ensured.workspace.workDir;
    session.worktreeBranch = ensured.workspace.branchName;
    session.worktreeState = "active";
    this.persistSession(session);
    return { ok: true, workspace: ensured.workspace };
  }

  create(opts: {
    channelId: string;
    userId: string;
    threadId?: string;
    topic?: string;
    id?: string;
    /** Explicit project path/name (SESSION-WORKTREE-4). */
    project?: string;
    /**
     * When false, skip worktree ensure (caller will bind later).
     * Default follows store ensureWorktree option.
     */
    ensureWorktree?: boolean;
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

    // Resolve project eagerly when default root known (freeze early).
    if (opts.project?.trim() || this.defaultProjectRoot) {
      const resolved = resolveProjectDir(opts.project, {
        defaultProjectRoot: this.defaultProjectRoot ?? process.cwd(),
        github: this.allowlist?.github,
      });
      if (resolved.ok) {
        session.project = resolved.dir;
      }
    }

    this.bySessionId.set(session.id, session);
    if (session.threadId) {
      this.byThreadId.set(session.threadId, session);
    }
    this.persistSession(session);

    const shouldEnsure =
      opts.ensureWorktree ?? this.ensureWorktreeOnCreate;
    if (shouldEnsure && (session.project || this.defaultProjectRoot)) {
      // Sync best-effort: Bun tests can await bindWorktree separately when needed.
      // We kick async bind and also expose bindWorktree for callers that await.
      void this.bindWorktree(session, { project: opts.project });
    }

    return session;
  }

  /**
   * Create session and await worktree bind (preferred for Discord spawn paths).
   */
  async createWithWorktree(opts: {
    channelId: string;
    userId: string;
    threadId?: string;
    topic?: string;
    id?: string;
    project?: string;
  }): Promise<
    | { ok: true; session: SessionStub; workspace: TalkWorkspace }
    | { ok: false; session: SessionStub; error: string }
  > {
    const session = this.create({ ...opts, ensureWorktree: false });
    const bound = await this.bindWorktree(session, { project: opts.project });
    if (!bound.ok) {
      return { ok: false, session, error: bound.error };
    }
    return { ok: true, session, workspace: bound.workspace };
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

  /** Agent cwd for a session: worktree when active, else project, else default. */
  cwdFor(session: SessionStub): string | undefined {
    if (session.worktreePath && session.worktreeState === "active") {
      return session.worktreePath;
    }
    return session.project ?? this.defaultProjectRoot;
  }
}

export { SESSION_TTL_DEFAULT_MS };
