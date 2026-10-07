/**
 * Discord session stub maps (DISCORD-1 / 2 / 2.a) with optional SQLite
 * durability + soft TTL (SESSION-1..4 / REQ-discord-019), per-talk
 * worktree isolation (SESSION-WORKTREE-1..5 / REQ-discord-022) and the
 * session's thread of turns (AGENT-6 / REQ-discord-072), replayed whole to
 * the run, which condenses it at about 80% of its model's window with a
 * model-written summary that is kept here, and kept 30 days per thread after
 * the session ends, so a later reply starts a new session from it
 * (SESSION-5/5.a/6, SESSION-3.a, AGENT-6.a / REQ-discord-472).
 * No ProcessManager.
 */

import type { Database } from "bun:sqlite";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { AllowlistConfig } from "../allowlist/types.ts";
import {
  appendSummary,
  condenseBudgetChars,
  type CondenseReport,
  type ConversationRecord,
  type ConversationReplay,
  ConversationStore,
  discordParticipant,
  discordThreadKey,
  resolveContextWindowTokens,
  summaryCapChars,
  summaryPoint,
  summaryPoints,
} from "../store/conversation.ts";
import { formatErrorLine, scrubOpt, scrubSecrets } from "../store/scrub.ts";
import {
  isSessionExpired,
  resolveSessionTtlMs,
  SESSION_TTL_DEFAULT_MS,
} from "../store/session-ttl.ts";
import {
  ensureTalkWorkspace,
  isGitRepo,
  parkWorktree,
  resolveProjectDir,
  type TalkWorkspace,
  type TalkWorkspaceKind,
} from "../worktree/index.ts";
import { removeSessionAttachments } from "./image-attachments.ts";
import { askFromUnknown } from "../agent/ask.ts";
import type { HumanAsk } from "../agent/types.ts";
import { isAskExpired, type PendingAsk } from "./ask-buttons.ts";
import {
  ensureSessionTurns,
  SESSION_THREAD_FOOTER,
  SESSION_THREAD_HEADER,
  SESSION_THREAD_MAX_TURNS,
  type SessionTurn,
  type SessionTurnRole,
  withSessionThread,
} from "./session-thread.ts";
import { clipTurnForRole } from "../store/conversation.ts";
import type { SessionStub } from "./types.ts";

/**
 * One open ask as stored. The question and option labels are model-written
 * text, so they are secret-scrubbed like every stored text (SAFE-6). Option
 * ids are scrubbed too, as a backstop: `normalizeAskOptions` already swaps a
 * secret-looking id for its position, so for every ask it made the scrub is a
 * no-op and askId, expiresAt, option ids and stubMessageId are stored as they
 * are, so open buttons keep working.
 */
function pendingAskBody(ask: PendingAsk): Record<string, unknown> {
  const body: Record<string, unknown> = {
    reason: ask.reason,
    question: scrubSecrets(ask.question),
    askId: ask.askId,
    expiresAt: ask.expiresAt,
  };
  if (ask.options?.length) {
    body.options = ask.options.map((o) => ({
      ...o,
      id: scrubSecrets(o.id),
      label: scrubSecrets(o.label),
    }));
  }
  if (ask.stubMessageId) body.stubMessageId = ask.stubMessageId;
  return body;
}

/**
 * The session's open asks for `discord_sessions.pending_ask`: one object (as
 * before) when only `pendingAsk` is open, else a JSON array, oldest first and
 * `pendingAsk` last (SESSION-MULTI-3). Same column, no schema bump.
 */
function serializePendingAsks(session: SessionStub): string | null {
  const open = openAsksOf(session);
  if (open.length === 0) return null;
  if (open.length === 1) return JSON.stringify(pendingAskBody(open[0]!));
  return JSON.stringify(open.map(pendingAskBody));
}

/**
 * Stored open asks: the newest loads as the session's `pendingAsk`, the
 * earlier ones as its `openAsks` (SESSION-MULTI-3). A single-object row loads
 * as that one ask, as before.
 */
function parsePendingAsks(
  raw: string | null | undefined,
): Pick<SessionStub, "pendingAsk" | "openAsks"> {
  if (!raw) return { pendingAsk: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { pendingAsk: null };
  }
  const asks: PendingAsk[] = [];
  for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
    const ask = parsePendingAsk(item);
    if (ask && !asks.some((a) => a.askId === ask.askId)) asks.push(ask);
  }
  const pendingAsk = asks.pop() ?? null;
  return asks.length > 0 ? { pendingAsk, openAsks: asks } : { pendingAsk };
}

/**
 * A stored pending ask (AUTONOMY-5/6). A spend-cap stop is never pending —
 * a reply cannot lift the cap (SAFE-8) — so one persisted by an earlier
 * build loads as no pending ask.
 */
function parsePendingAsk(raw: unknown): PendingAsk | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    const parsed = raw as Record<string, unknown>;
    const base = askFromUnknown(parsed);
    if (!base || base.reason === "spend-cap") return null;
    const askId =
      typeof parsed.askId === "string" && parsed.askId.trim()
        ? parsed.askId.trim()
        : "";
    const expiresAt =
      typeof parsed.expiresAt === "number" && Number.isFinite(parsed.expiresAt)
        ? parsed.expiresAt
        : 0;
    // Legacy rows (pre-button): synthesize askId/expiresAt so free-text path still works.
    const pending: PendingAsk = {
      ...base,
      askId: askId || `legacy_${base.question.slice(0, 8)}`,
      expiresAt: expiresAt || Date.now() + 30 * 60 * 1000,
    };
    if (typeof parsed.stubMessageId === "string" && parsed.stubMessageId.trim()) {
      pending.stubMessageId = parsed.stubMessageId.trim();
    }
    return pending;
  } catch {
    return null;
  }
}

/**
 * Thread index key: one session per Discord user per thread (DISCORD-2.a /
 * SESSION-MULTI-1). NUL never appears in a Discord id.
 */
function threadUserKey(threadId: string, userId: string): string {
  return `${threadId}\u0000${userId}`;
}

function newId(): string {
  return `sess_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * An ask that is no longer open because it timed out or its session was
 * TTL-purged, kept only so a late press on its buttons gets "that choice
 * expired" and not "not yours" (DISCORD-ASK-5 / REQ-discord-045). Only the
 * askId, the session's Discord user, the ask's expiry and where the talk
 * lived (its channel and thread ids, so the press passes the same channel
 * gate as on a live ask, REQ-discord-212 / DISCORD-2.a) are kept: never the
 * question or option text (SAFE-6). Memory only, never written to the DB.
 */
export type ClosedAsk = {
  askId: string;
  userId: string;
  expiresAt: number;
  channelId: string;
  threadId?: string;
};

/** Closed asks kept in memory, newest last; past this the oldest is forgotten. */
export const CLOSED_ASKS_MAX = 1000;

/** Every open ask of a session: earlier open asks first, `pendingAsk` last. */
function openAsksOf(session: SessionStub): PendingAsk[] {
  const open = [...(session.openAsks ?? [])];
  if (session.pendingAsk) open.push(session.pendingAsk);
  return open;
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
  /**
   * The fallback context window in tokens (`CORVIDINHO_LLM_CONTEXT_TOKENS`):
   * it sizes the summary cap when a turn past the per-session cap is folded
   * here. The 80% trigger itself is the run's, against its own model's window
   * (SESSION-5.a). Default `resolveContextWindowTokens()`.
   */
  contextWindowTokens?: number;
};

/**
 * SESSION-5.a — a session's conversation as a run gets it (`replayFor`): its
 * turns are the session's own turn objects, so `applyCondensed` drops exactly
 * the ones the run folded.
 */
export type SessionReplay = ConversationReplay & { turns: SessionTurn[] };

/** Same directory by realpath (lexically when either no longer resolves). */
function sameDir(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

/**
 * The kind of workspace a session row is bound to. Only the columns are
 * stored: a branch means a linked worktree, a path that is the project folder
 * itself means `project_dir` (AGENT-1.a), anything else a scoped dir.
 */
export function sessionWorkspaceKind(session: SessionStub): TalkWorkspaceKind {
  if (session.worktreeBranch) return "worktree";
  if (session.worktreePath && session.project && sameDir(session.worktreePath, session.project)) {
    return "project_dir";
  }
  return "scoped_dir";
}

export class SessionStore {
  /** bot reply message id → session */
  readonly byBotMessageId = new Map<string, SessionStub>();
  /**
   * (thread id, Discord user id) → that user's session in the thread
   * (DISCORD-2.a per user / SESSION-MULTI-1): a second user in a thread gets
   * their own entry and never replaces the first user's.
   */
  readonly byThreadUser = new Map<string, SessionStub>();
  /** session id → session */
  readonly bySessionId = new Map<string, SessionStub>();

  private readonly db: Database | undefined;
  readonly ttlMs: number;
  private readonly now: () => number;
  readonly defaultProjectRoot: string | undefined;
  private readonly allowlist: AllowlistConfig | undefined;
  private readonly ensureWorktreeOnCreate: boolean;
  /** session id → number of agent runs in flight (REQ-discord-204). */
  private readonly activeRuns = new Map<string, number>();
  /** session id → recorded turns, oldest first (REQ-discord-072). */
  private readonly turns = new Map<string, SessionTurn[]>();
  /** askId → an ask no longer open, for a late press (DISCORD-ASK-5). */
  private readonly closedAsks = new Map<string, ClosedAsk>();
  /** session id → condensed summary of its folded turns (SESSION-5/6). */
  private readonly summaries = new Map<string, string>();
  /** session id → id of the retained conversation it carries (AGENT-6.a). */
  private readonly conversationIds = new Map<string, string>();
  /** Retained conversations (SESSION-6 / AGENT-6.a); only with a DB. */
  private readonly conversations: ConversationStore | undefined;
  /** Fallback context window in tokens (sizes the turn-cap summary cap). */
  readonly contextWindowTokens: number;

  constructor(opts: SessionStoreOptions = {}) {
    this.db = opts.db;
    this.ttlMs = opts.ttlMs ?? resolveSessionTtlMs();
    this.now = opts.now ?? (() => Date.now());
    this.defaultProjectRoot = opts.defaultProjectRoot;
    this.allowlist = opts.allowlist;
    this.ensureWorktreeOnCreate = opts.ensureWorktree === true;
    this.contextWindowTokens = opts.contextWindowTokens ?? resolveContextWindowTokens();
    this.conversations = this.db
      ? new ConversationStore({ db: this.db, now: () => this.nowMs() })
      : undefined;
    if (this.db) {
      ensureSessionTurns(this.db);
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
    // A run in flight is live work in the worktree, never an idle talk.
    if (this.activeRuns.has(session.id)) return false;
    if (!this.expired(session)) return false;
    // AGENT-6.a / SESSION-3.a: keep its conversation before the live rows go.
    this.retainConversation(session);
    // Sync drop so lookups never return expired; park async (SESSION-WORKTREE-3).
    void this.parkSessionWorktree(session);
    // DISCORD-ASK-5: a later press on this talk's buttons is a late press.
    this.closeAsks(session, openAsksOf(session));
    this.removeLocal(session);
    this.deleteFromDb(session.id);
    return true;
  }

  private removeLocal(session: SessionStub): void {
    this.bySessionId.delete(session.id);
    this.turns.delete(session.id);
    this.summaries.delete(session.id);
    this.conversationIds.delete(session.id);
    if (session.threadId) {
      const key = threadUserKey(session.threadId, session.userId);
      if (this.byThreadUser.get(key)?.id === session.id) this.byThreadUser.delete(key);
    }
    for (const [botId, s] of [...this.byBotMessageId.entries()]) {
      if (s.id === session.id) this.byBotMessageId.delete(botId);
    }
  }

  private loadFromDb(): void {
    if (!this.db) return;
    const now = this.nowMs();
    // AGENT-6.a: nothing idle past the retention window survives an open.
    this.purgeExpiredConversations();
    const sessions = this.db
      .query(
        `SELECT id, channel_id, thread_id, user_id, topic, project,
                worktree_path, worktree_branch, worktree_state,
                pending_ask, created_at, last_activity_at
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
      pending_ask: string | null;
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
          ...parsePendingAsks(row.pending_ask),
          createdAt: row.created_at,
          lastActivityAt: row.last_activity_at,
        };
        // AGENT-6.a / SESSION-3.a: a session that idled out while the
        // bridge was down keeps its conversation too.
        this.retainConversationFromDb(doomed);
        void this.parkSessionWorktree(doomed);
        this.closeAsks(doomed, openAsksOf(doomed));
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
        ...parsePendingAsks(row.pending_ask),
        createdAt: row.created_at,
        lastActivityAt: row.last_activity_at,
      };
      this.bySessionId.set(session.id, session);
      if (session.threadId) {
        this.byThreadUser.set(threadUserKey(session.threadId, session.userId), session);
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

    // REQ-discord-072: turns of live sessions only. Rows whose session is gone
    // (ended or expired by a build that did not delete them) are dropped.
    this.db.run(
      `DELETE FROM discord_session_turns
       WHERE session_id NOT IN (SELECT id FROM discord_sessions)`,
    );
    const turnRows = this.db
      .query(
        `SELECT session_id, role, content, created_at
         FROM discord_session_turns ORDER BY id`,
      )
      .all() as Array<{
      session_id: string;
      role: string;
      content: string;
      created_at: number;
    }>;
    for (const row of turnRows) {
      if (!this.bySessionId.has(row.session_id)) continue;
      const role = row.role;
      if (role !== "human" && role !== "agent") continue;
      const list = this.turns.get(row.session_id) ?? [];
      list.push({ role, content: row.content, createdAt: row.created_at });
      this.turns.set(row.session_id, list);
    }

    // SESSION-6: a live session's condensed summary survives the restart.
    if (this.conversations) {
      for (const session of this.bySessionId.values()) {
        const record = this.bestEffort("summary read", () =>
          this.conversations!.forSession(session.id),
        );
        if (!record) continue;
        this.conversationIds.set(session.id, record.id);
        if (record.summary) this.summaries.set(session.id, record.summary);
      }
    }
  }

  /** Run a conversation-store step; a DB failure is logged, never thrown. */
  private bestEffort<T>(what: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      console.warn(`[discord] conversation ${what} failed: ${formatErrorLine(err)}`);
      return undefined;
    }
  }

  /** The retained record a live session carries, if any. */
  private carriedConversation(session: SessionStub): ConversationRecord | undefined {
    if (!this.conversations) return undefined;
    const id = this.conversationIds.get(session.id);
    return id ? this.conversations.get(id) : this.conversations.forSession(session.id);
  }

  /**
   * Write a session's conversation (summary, turns, answer ids, project) to
   * its retained record, keeping the answer ids an earlier session of the same
   * conversation left there (SESSION-3.a). `lastActiveAt` (default now) is
   * when the conversation was last active. Best effort.
   */
  private saveConversation(
    session: SessionStub,
    parts: {
      summary: string;
      turns: readonly SessionTurn[];
      botMessageIds?: readonly string[];
      lastActiveAt?: number;
    },
  ): void {
    const store = this.conversations;
    if (!store) return;
    this.bestEffort("write", () => {
      const prior = this.carriedConversation(session);
      const record = store.save({
        id: prior?.id,
        surface: "discord",
        threadKey: discordThreadKey(session),
        userId: session.userId,
        sessionId: session.id,
        // SESSION-WORKTREE-4: a session resumed from it works in this project.
        ...(session.project ?? prior?.project
          ? { project: session.project ?? prior?.project }
          : {}),
        summary: parts.summary,
        turns: parts.turns,
        participants: [discordParticipant(session.userId)],
        botMessageIds: [...(prior?.botMessageIds ?? []), ...(parts.botMessageIds ?? [])],
        ...(parts.lastActiveAt !== undefined ? { lastActiveAt: parts.lastActiveAt } : {}),
      });
      if (this.bySessionId.get(session.id) === session) {
        this.conversationIds.set(session.id, record.id);
      }
    });
  }

  /**
   * AGENT-6.a / SESSION-3.a — a session that ends or idles out keeps its
   * conversation (summary, last turns, answer ids, project) for the retention
   * window, counted from its last activity. A session with nothing said is not
   * kept.
   */
  private retainConversation(session: SessionStub): void {
    const turns = this.turns.get(session.id) ?? [];
    const summary = this.summaries.get(session.id) ?? "";
    if (turns.length === 0 && !summary) return;
    const botMessageIds = [...this.byBotMessageId.entries()]
      .filter(([, s]) => s.id === session.id)
      .map(([id]) => id);
    this.saveConversation(session, {
      summary,
      turns,
      botMessageIds,
      lastActiveAt: session.lastActivityAt,
    });
  }

  /** {@link retainConversation} for a session only in the DB (expired at load). */
  private retainConversationFromDb(session: SessionStub): void {
    const db = this.db;
    if (!db || !this.conversations) return;
    this.bestEffort("retain", () => {
      const turns = (
        db
          .query(
            `SELECT role, content, created_at FROM discord_session_turns
             WHERE session_id = ? ORDER BY id`,
          )
          .all(session.id) as Array<{ role: string; content: string; created_at: number }>
      )
        .filter((r) => r.role === "human" || r.role === "agent")
        .map((r) => ({
          role: r.role as SessionTurnRole,
          content: r.content,
          createdAt: r.created_at,
        }));
      const botMessageIds = (
        db
          .query(`SELECT bot_message_id FROM discord_session_bot_messages WHERE session_id = ?`)
          .all(session.id) as Array<{ bot_message_id: string }>
      ).map((r) => r.bot_message_id);
      const summary = this.conversations!.forSession(session.id)?.summary ?? "";
      if (turns.length === 0 && !summary) return;
      this.saveConversation(session, {
        summary,
        turns,
        botMessageIds,
        lastActiveAt: session.lastActivityAt,
      });
    });
  }

  private persistSession(session: SessionStub): void {
    if (!this.db) return;
    this.db.run(
      `INSERT INTO discord_sessions
        (id, channel_id, thread_id, user_id, topic, project,
         worktree_path, worktree_branch, worktree_state, pending_ask,
         created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         channel_id = excluded.channel_id,
         thread_id = excluded.thread_id,
         user_id = excluded.user_id,
         topic = excluded.topic,
         project = excluded.project,
         worktree_path = excluded.worktree_path,
         worktree_branch = excluded.worktree_branch,
         worktree_state = excluded.worktree_state,
         pending_ask = excluded.pending_ask,
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
        serializePendingAsks(session),
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
    this.db.run(`DELETE FROM discord_session_turns WHERE session_id = ?`, [
      sessionId,
    ]);
    this.db.run(`DELETE FROM discord_sessions WHERE id = ?`, [sessionId]);
  }

  /**
   * Write a session row's worktree columns. UPDATE only, so a row already
   * deleted (ended or TTL-purged talk) is never re-inserted.
   */
  private persistWorktreeState(session: SessionStub): void {
    if (!this.db) return;
    this.db.run(
      `UPDATE discord_sessions
       SET worktree_path = ?, worktree_branch = ?, worktree_state = ?
       WHERE id = ?`,
      [
        session.worktreePath ?? null,
        session.worktreeBranch ?? null,
        session.worktreeState ?? null,
        session.id,
      ],
    );
  }

  /** Park/remove worktree so another talk cannot reuse it as cwd. */
  async parkSessionWorktree(session: SessionStub): Promise<void> {
    // AGENT-1.a: in a non-git project the owner's images sit in the project
    // folder under this session's own attachments dir; every end path
    // (end, abandon, TTL purge, a row found expired at start) parks here.
    if (
      session.project &&
      (sessionWorkspaceKind(session) === "project_dir" || !isGitRepo(session.project))
    ) {
      removeSessionAttachments(session.project, session.id);
    }
    if (!session.worktreePath || !session.project) {
      session.worktreeState = "removed";
      return;
    }
    // `parked` with a path still recorded is a park cut short (crash before
    // the removal finished): parking is idempotent, so finish it.
    if (session.worktreeState === "removed") {
      return;
    }
    // Record `parked` before any removal side effect: a crash from here on
    // restarts with a row that bindWorktree re-binds fresh, never one that
    // still says `active` at a removed directory (SESSION-WORKTREE-3).
    session.worktreeState = "parked";
    this.persistWorktreeState(session);
    // A `project_dir` talk (AGENT-1.a) is only let go of: park never deletes
    // the project folder.
    const state = await parkWorktree(session.project, session.worktreePath, {
      kind: sessionWorkspaceKind(session),
      branchName: session.worktreeBranch,
    });
    session.worktreeState = state;
    session.worktreePath = undefined;
    this.persistWorktreeState(session);
  }

  /**
   * End/abandon a talk: park worktree, drop from maps + DB (SESSION-WORKTREE-3).
   */
  async endSession(session: SessionStub): Promise<void> {
    // AGENT-6.a: an ended talk keeps its conversation like an idle one.
    if (this.bySessionId.get(session.id) === session) this.retainConversation(session);
    await this.parkSessionWorktree(session);
    this.removeLocal(session);
    this.deleteFromDb(session.id);
  }

  /**
   * Bind an isolated workspace onto a session (idempotent if already bound).
   * Never silently switches project mid-conversation (SESSION-WORKTREE-4).
   * A recorded worktree whose directory is gone (crash mid-park, removed out
   * of band) is re-created for the same project and session, never handed
   * out as cwd (SESSION-WORKTREE-3). In a project that is not a git repo the
   * talk is bound to the project folder itself (`project_dir`, AGENT-1.a;
   * only the owner's runs may change it, the tool layer's role gate). A row
   * bound before that to a scoped dir of a non-git project, or in place in a
   * project that has since become a git repo, is parked, then re-bound.
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
      const kind = sessionWorkspaceKind(session);
      const stale =
        session.project !== undefined &&
        ((kind === "scoped_dir" && !isGitRepo(session.project)) ||
          (kind === "project_dir" && isGitRepo(session.project)));
      if (stale) {
        // AGENT-1.a: a legacy scoped dir of a non-git project, or a project
        // folder that is a git repo now: park it, then bind afresh below.
        await this.parkSessionWorktree(session);
      } else if (existsSync(session.worktreePath)) {
        return {
          ok: true,
          workspace: {
            kind,
            workDir: session.worktreePath,
            projectWorkingDir: session.project ?? session.worktreePath,
            branchName: session.worktreeBranch,
            worktreeId: session.id,
            state: "active",
          },
        };
      }
      // Recorded worktree is gone: fall through and re-create it below.
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
      // AGENT-1.a: a non-git project's talk works in the folder itself.
      nonGit: "project_dir",
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
      this.byThreadUser.set(threadUserKey(session.threadId, session.userId), session);
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

  /**
   * Run `fn` (an agent run) with the session marked busy: the soft-TTL purge
   * never drops or parks it meanwhile, and the end of the run counts as
   * activity (SESSION-2 / SESSION-WORKTREE-3 / REQ-discord-204).
   */
  async runActive<T>(session: SessionStub, fn: () => Promise<T>): Promise<T> {
    this.activeRuns.set(session.id, (this.activeRuns.get(session.id) ?? 0) + 1);
    try {
      return await fn();
    } finally {
      const left = (this.activeRuns.get(session.id) ?? 1) - 1;
      if (left > 0) this.activeRuns.set(session.id, left);
      else this.activeRuns.delete(session.id);
      // Only a still-live session is touched; an ended one stays ended.
      if (this.bySessionId.get(session.id) === session) this.touch(session);
    }
  }

  /**
   * Store a pending human ask on a session, or clear them all (AUTONOMY-5/6).
   * Asks are keyed by askId (SESSION-MULTI-3 / REQ-discord-044): a new ask
   * becomes the session's `pendingAsk`, and the button ask it supersedes
   * stays open in `openAsks` until it is picked, pressed late or cancelled
   * (or, once timed out, until a newer ask is cleared) — a later run that
   * asks again never takes its buttons away. A superseded
   * free-text ask is replaced (a reply answers one question). Storing an
   * askId the session already holds updates that ask in place. `null` clears
   * every open ask (explicit cancel). Persists when a DB is configured.
   */
  setPendingAsk(session: SessionStub, ask: PendingAsk | null): void {
    // An open ask is never a closed one (DISCORD-ASK-5).
    if (ask) this.closedAsks.delete(ask.askId);
    if (!ask) {
      session.pendingAsk = null;
      delete session.openAsks;
    } else if (session.pendingAsk?.askId === ask.askId) {
      session.pendingAsk = ask;
    } else {
      const held = session.openAsks?.findIndex((a) => a.askId === ask.askId) ?? -1;
      if (held >= 0) {
        session.openAsks![held] = ask;
      } else {
        const prev = session.pendingAsk;
        if (prev?.options?.length) {
          session.openAsks = [...(session.openAsks ?? []), prev];
        }
        session.pendingAsk = ask;
      }
    }
    this.persistSession(session);
  }

  /**
   * Clear one open ask by askId — a pick, a late press or a free-text answer
   * (SESSION-MULTI-3). The session's other open asks stay; when `pendingAsk`
   * is cleared the newest remaining open ask that has not timed out takes its
   * place, and earlier asks already past their timeout are dropped then, so a
   * thin reply never restates buttons that only answer "that choice expired".
   * An ask that leaves past its timeout (the cleared one or a dropped one) is
   * kept as a closed ask for a later press (DISCORD-ASK-5 / `findClosedAsk`).
   * No-op when the session does not hold that askId.
   */
  clearPendingAsk(session: SessionStub, askId: string): void {
    const earlier = session.openAsks ?? [];
    const nowMs = this.nowMs();
    let cleared: PendingAsk;
    let dropped: PendingAsk[] = [];
    if (session.pendingAsk?.askId === askId) {
      cleared = session.pendingAsk;
      const live = earlier.filter((a) => !isAskExpired(a, nowMs));
      dropped = earlier.filter((a) => isAskExpired(a, nowMs));
      session.pendingAsk = live.at(-1) ?? null;
      const rest = live.slice(0, -1);
      if (rest.length > 0) session.openAsks = rest;
      else delete session.openAsks;
    } else {
      const held = earlier.find((a) => a.askId === askId);
      if (!held) return;
      cleared = held;
      const rest = earlier.filter((a) => a.askId !== askId);
      if (rest.length > 0) session.openAsks = rest;
      else delete session.openAsks;
    }
    // DISCORD-ASK-5: an ask that leaves past its timeout (the late-pressed ask
    // itself, or an earlier one dropped above) stays a closed ask, so a later
    // press on it is still "that choice expired". A pick or an answer of a
    // live ask is not closed: a re-press stays a no-op (DISCORD-ASK-8).
    this.closeAsks(
      session,
      isAskExpired(cleared, nowMs) ? [...dropped, cleared] : dropped,
    );
    this.persistSession(session);
  }

  /**
   * Keep `asks` as closed asks of `session` (DISCORD-ASK-5): askId, user,
   * expiry and the talk's channel and thread ids only (SAFE-6), newest last,
   * at most CLOSED_ASKS_MAX.
   */
  private closeAsks(
    session: Pick<SessionStub, "userId" | "channelId" | "threadId">,
    asks: readonly PendingAsk[],
  ): void {
    for (const ask of asks) {
      this.closedAsks.delete(ask.askId);
      this.closedAsks.set(ask.askId, {
        askId: ask.askId,
        userId: session.userId,
        expiresAt: ask.expiresAt,
        channelId: session.channelId,
        ...(session.threadId !== undefined ? { threadId: session.threadId } : {}),
      });
    }
    while (this.closedAsks.size > CLOSED_ASKS_MAX) {
      const oldest = this.closedAsks.keys().next().value;
      if (oldest === undefined) break;
      this.closedAsks.delete(oldest);
    }
  }

  /**
   * An ask that timed out, or whose session was TTL-purged, and is no longer
   * open (DISCORD-ASK-5): a press on it is a late press. Undefined for an ask
   * that is still open, was picked, answered or cancelled, or is unknown.
   * Expired sessions are purged first, as in `findPendingAsk`.
   */
  findClosedAsk(askId: string): ClosedAsk | undefined {
    this.list();
    const closed = this.closedAsks.get(askId);
    return closed ? { ...closed } : undefined;
  }

  /**
   * The live session holding open ask `askId` and that ask, whether it is the
   * session's `pendingAsk` or an earlier open one (DISCORD-ASK-3 /
   * SESSION-MULTI-3). Expired sessions are purged first, as in `list()`.
   */
  findPendingAsk(askId: string): { session: SessionStub; ask: PendingAsk } | undefined {
    for (const session of this.list()) {
      if (session.pendingAsk?.askId === askId) {
        return { session, ask: session.pendingAsk };
      }
      const ask = session.openAsks?.find((a) => a.askId === askId);
      if (ask) return { session, ask };
    }
    return undefined;
  }

  /**
   * Record one turn of a live session's thread (AGENT-6 / REQ-discord-072):
   * the human's own words for a run (before memory/identity/image
   * enrichment), recorded as the run starts so a run that throws or a bridge
   * that dies mid-run still keeps the request, or the answer the bridge
   * posted, recorded when the run ends. The text is scrubbed (SAFE-6) and
   * clipped before it is kept; an empty turn is skipped. Past
   * SESSION_THREAD_MAX_TURNS the oldest turn after the opening request is
   * dropped. An ended or expired session is not recorded, so its thread never
   * comes back (SESSION-3). The DB write is best effort: a failure is logged
   * and the in-memory thread still holds the turn.
   */
  recordTurn(session: SessionStub, role: SessionTurnRole, text: string): void {
    if (this.bySessionId.get(session.id) !== session) return;
    // Scrub before clipping, so a cut never leaves half a secret behind.
    const content = clipTurnForRole(role, scrubSecrets(text));
    if (!content) return;
    const turn: SessionTurn = { role, content, createdAt: this.nowMs() };
    const list = this.turns.get(session.id) ?? [];
    list.push(turn);
    const gone: SessionTurn[] = [];
    while (list.length > SESSION_THREAD_MAX_TURNS) {
      gone.push(...list.splice(1, 1));
    }
    const dropped = gone.length;
    this.turns.set(session.id, list);
    if (dropped > 0) {
      // SESSION-5: a turn past the cap is folded into the summary, not lost.
      this.setSummary(
        session,
        appendSummary(
          this.summaries.get(session.id) ?? "",
          gone.map(summaryPoint),
          summaryCapChars(condenseBudgetChars(this.contextWindowTokens)),
        ),
      );
    }
    if (!this.db) return;
    const db = this.db;
    try {
      db.transaction(() => {
        db.run(
          `INSERT INTO discord_session_turns (session_id, role, content, created_at)
           VALUES (?, ?, ?, ?)`,
          [session.id, turn.role, turn.content, turn.createdAt],
        );
        if (dropped > 0) {
          // Keep the opening turn and the newest MAX - 1, as in memory.
          db.run(
            `DELETE FROM discord_session_turns
             WHERE session_id = ?1
               AND id NOT IN (SELECT id FROM discord_session_turns
                              WHERE session_id = ?1 ORDER BY id LIMIT 1)
               AND id NOT IN (SELECT id FROM discord_session_turns
                              WHERE session_id = ?1 ORDER BY id DESC LIMIT ?2)`,
            [session.id, SESSION_THREAD_MAX_TURNS - 1],
          );
        }
      })();
    } catch (err) {
      console.warn(
        `[discord] session thread write for ${session.id} failed: ${formatErrorLine(err)}`,
      );
    }
  }

  /** The session's recorded turns, oldest first (a copy; REQ-discord-072). */
  threadFor(session: SessionStub): SessionTurn[] {
    return [...(this.turns.get(session.id) ?? [])];
  }

  /** The session's condensed summary ("" when nothing was folded; SESSION-5/6). */
  summaryFor(session: SessionStub): string {
    return this.summaries.get(session.id) ?? "";
  }

  /** Store a live session's summary with it (SESSION-6), scrubbed (SAFE-6). */
  private setSummary(session: SessionStub, summary: string): void {
    if (this.bySessionId.get(session.id) !== session) return;
    const clean = scrubSecrets(summary);
    this.summaries.set(session.id, clean);
    // The record holds the summary while the session is live; its turns are
    // written when the session ends (the live ones are in discord_session_turns).
    this.saveConversation(session, { summary: clean, turns: [] });
  }

  /** Replace a session's stored turn rows with `turns` (after a fold). Best effort. */
  private rewriteTurns(sessionId: string, turns: readonly SessionTurn[]): void {
    const db = this.db;
    if (!db) return;
    try {
      db.transaction(() => {
        db.run(`DELETE FROM discord_session_turns WHERE session_id = ?`, [sessionId]);
        for (const t of turns) {
          db.run(
            `INSERT INTO discord_session_turns (session_id, role, content, created_at)
             VALUES (?, ?, ?, ?)`,
            [sessionId, t.role, t.content, t.createdAt],
          );
        }
      })();
    } catch (err) {
      console.warn(
        `[discord] session thread rewrite for ${sessionId} failed: ${formatErrorLine(err)}`,
      );
    }
  }

  /**
   * SESSION-5/5.a/6 — `prompt` (the new message, pending-ask block included)
   * with the session's condensed summary and its earlier turns, whole,
   * ahead of it. Nothing is folded here: the run gets the same conversation
   * ({@link replayFor}), measures the whole prompt its model sees and, at
   * about 80% of that model's own window, folds the oldest turns and has the
   * model write their summary (src/agent/condense.ts); the opening request
   * and the newest human turn are never folded, and `prompt` is never
   * touched. {@link applyCondensed} keeps what it did with the session.
   */
  threadPrompt(session: SessionStub, prompt: string): string {
    return withSessionThread(prompt, this.threadFor(session), { summary: this.summaryFor(session) });
  }

  /**
   * SESSION-5.a — the conversation {@link threadPrompt} replays, for the run
   * to condense (`AgentRunChatOpts.conversation`); undefined when the session
   * has no summary and no turns. Its turns are the session's own, so
   * {@link applyCondensed} can tell which were folded.
   */
  replayFor(session: SessionStub): SessionReplay | undefined {
    const turns = this.threadFor(session);
    const summary = this.summaryFor(session);
    if (turns.length === 0 && !summary) return undefined;
    return { header: SESSION_THREAD_HEADER, footer: SESSION_THREAD_FOOTER, summary, turns };
  }

  /**
   * SESSION-5.a / SESSION-6 — keep what a run's condensing did: the folded
   * turns of `replay` leave the live thread and the report's summary (the
   * model's, or the extractive one when its call failed) becomes the
   * session's, stored with it (scrubbed; its retained record holds it, so a
   * restart, a resume after the TTL or another model picks up from it). A
   * point the store added meanwhile (a turn past the per-session cap) stays
   * after it. A session that ended meanwhile is left alone, and so is one
   * whose thread was cleared meanwhile (an approved forget-me, MEMORY-ACL-6:
   * its opening turn is gone), so a summary of forgotten turns is never
   * stored again.
   */
  applyCondensed(session: SessionStub, replay: SessionReplay, report: CondenseReport): void {
    if (this.bySessionId.get(session.id) !== session) return;
    // The opening turn stays in a live thread (the turn cap folds the one
    // after it; a fold never takes a pinned turn): gone means cleared.
    const live = this.turns.get(session.id);
    if (!live || replay.turns.length === 0 || live[0] !== replay.turns[0]) return;
    const gone = new Set(report.folded.map((i) => replay.turns[i]).filter((t) => t !== undefined));
    const kept = (this.turns.get(session.id) ?? []).filter((t) => !gone.has(t));
    const before = new Set(summaryPoints(replay.summary));
    const added = summaryPoints(this.summaryFor(session)).filter((p) => !before.has(p));
    const summary =
      added.length > 0
        ? appendSummary(report.summary, added, summaryCapChars(condenseBudgetChars(this.contextWindowTokens)))
        : report.summary;
    this.turns.set(session.id, kept);
    // Summary first: a crash between the two writes leaves a turn both in
    // the summary and in the rows (folded again next time), never in neither.
    this.setSummary(session, summary);
    this.rewriteTurns(session.id, kept);
  }

  /**
   * SESSION-3.a — the retained conversation one of whose answers is
   * `botMessageId`, after its session ended or idled out.
   */
  retainedForReply(botMessageId: string): ConversationRecord | undefined {
    return this.conversations
      ? this.bestEffort("read", () => this.conversations!.byBotMessage(botMessageId))
      : undefined;
  }

  /** SESSION-3.a — this user's retained conversation in a Discord thread. */
  retainedForThread(threadId: string, userId: string): ConversationRecord | undefined {
    return this.conversations
      ? this.bestEffort("read", () =>
          this.conversations!.latestForThread("discord", discordThreadKey({ channelId: "", threadId }), userId),
        )
      : undefined;
  }

  /**
   * SESSION-3.a — start a new session for `where` that begins from a
   * retained conversation: its summary and kept turns seed the new session,
   * which then carries the record (the next end or idle-out updates it).
   * The record is read again first, so turns a carrying session kept there
   * after `record` was read (it idled out on the way here) are not lost;
   * undefined when it is gone (purged or forgotten). The new session works in
   * the conversation's project (SESSION-WORKTREE-4): when that project no
   * longer resolves, binding its worktree fails honestly instead of silently
   * switching to the default project.
   */
  resumeFromRetained(
    record: ConversationRecord,
    where: { channelId: string; userId: string; threadId?: string },
  ): SessionStub | undefined {
    let current = record;
    if (this.conversations) {
      let reread: ConversationRecord | undefined;
      try {
        reread = this.conversations.get(record.id);
      } catch (err) {
        console.warn(`[discord] conversation read failed: ${formatErrorLine(err)}`);
        reread = record;
      }
      if (!reread) return undefined;
      current = reread;
    }
    const session = this.create({
      channelId: where.channelId,
      userId: where.userId,
      threadId: where.threadId,
      ...(current.project ? { project: current.project } : {}),
    });
    if (current.project && session.project !== current.project) {
      session.project = current.project;
      this.persistSession(session);
    }
    const turns = current.turns.map((t) => ({ ...t }));
    this.turns.set(session.id, turns);
    this.rewriteTurns(session.id, turns);
    if (current.summary) this.summaries.set(session.id, current.summary);
    this.conversationIds.set(session.id, current.id);
    // Active again: its 30 days count from now.
    this.bestEffort("resume", () =>
      this.conversations?.save({
        ...current,
        sessionId: session.id,
      }),
    );
    return session;
  }

  /**
   * AGENT-6.a / MEMORY-ACL-6 — forget a Discord user's conversations: their
   * live sessions' turns and summaries (the sessions stay open, empty) and
   * every retained record that is theirs. The per-person delete the forget-me
   * flow calls once it is approved. Returns retained records deleted.
   */
  forgetConversations(userId: string): number {
    // Sessions already past the TTL are retained first, so they go too.
    this.list();
    for (const session of [...this.bySessionId.values()]) {
      if (session.userId !== userId) continue;
      this.turns.delete(session.id);
      this.summaries.delete(session.id);
      this.conversationIds.delete(session.id);
      this.rewriteTurns(session.id, []);
    }
    if (!this.conversations) return 0;
    return this.conversations.deleteForPerson({ discordUserIds: [userId] });
  }

  /** Purge retained conversations idle past 30 days (AGENT-6.a). */
  purgeExpiredConversations(): number {
    return this.conversations
      ? (this.bestEffort("purge", () => this.conversations!.purgeExpired()) ?? 0)
      : 0;
  }

  /**
   * MEMORY-ACL-6: drop the recorded turns of every session of these Discord
   * users — the in-memory thread the next run replays (REQ-discord-072) as
   * well as the stored rows — once the owner approved forgetting them. The
   * sessions themselves stay. Their condensed summaries (in memory) and kept
   * conversations (`conversation_threads`) go too, so nothing of theirs is
   * replayed or kept again (AGENT-6.a / REQ-discord-472). Returns how many
   * sessions had a thread cleared.
   */
  forgetTurnsOfUsers(userIds: readonly string[]): number {
    const ids = new Set(userIds.map((s) => s.trim()).filter(Boolean));
    if (ids.size === 0) return 0;
    let cleared = 0;
    for (const session of this.bySessionId.values()) {
      if (!ids.has(session.userId)) continue;
      if (this.turns.delete(session.id)) cleared += 1;
      this.summaries.delete(session.id);
      this.conversationIds.delete(session.id);
      if (!this.db) continue;
      try {
        this.db.run(`DELETE FROM discord_session_turns WHERE session_id = ?`, [session.id]);
      } catch (err) {
        console.warn(
          `[discord] forget: session thread delete for ${session.id} failed: ${formatErrorLine(err)}`,
        );
      }
    }
    if (this.conversations) {
      this.bestEffort("forget", () =>
        this.conversations!.deleteForPerson({ discordUserIds: [...ids] }),
      );
    }
    return cleared;
  }

  /**
   * Active session for this Discord user in this channel (SESSION-MULTI-1).
   * Newest non-expired match wins. Thread-scoped talks use threadId as the
   * channel key when present.
   */
  getByUserChannel(
    userId: string,
    channelId: string,
    threadId?: string,
  ): SessionStub | undefined {
    let best: SessionStub | undefined;
    for (const session of this.bySessionId.values()) {
      if (this.purgeIfExpired(session)) continue;
      if (session.userId !== userId) continue;
      if (threadId) {
        if (session.threadId !== threadId) continue;
      } else {
        if (session.channelId !== channelId) continue;
        // Prefer non-thread sessions when looking up by parent channel.
        if (session.threadId) continue;
      }
      if (!best || session.lastActivityAt > best.lastActivityAt) best = session;
    }
    return best;
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

  /**
   * With `userId`: that user's live session in the thread (DISCORD-2.a /
   * SESSION-MULTI-1), never another user's. Without it: the most recently
   * active live session in the thread, whoever owns it.
   */
  getByThread(threadId: string, userId?: string): SessionStub | undefined {
    if (userId !== undefined) {
      const session = this.byThreadUser.get(threadUserKey(threadId, userId));
      if (this.purgeIfExpired(session)) return undefined;
      return session;
    }
    let best: SessionStub | undefined;
    for (const session of [...this.byThreadUser.values()]) {
      if (session.threadId !== threadId) continue;
      if (this.purgeIfExpired(session)) continue;
      if (!best || session.lastActivityAt > best.lastActivityAt) best = session;
    }
    return best;
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

  /**
   * Agent cwd for a session: worktree when active, else project, else default.
   * Call after bindWorktree, which verifies the recorded worktree directory
   * and re-creates a missing one.
   */
  cwdFor(session: SessionStub): string | undefined {
    if (session.worktreePath && session.worktreeState === "active") {
      return session.worktreePath;
    }
    return session.project ?? this.defaultProjectRoot;
  }
}

export { SESSION_TTL_DEFAULT_MS };
