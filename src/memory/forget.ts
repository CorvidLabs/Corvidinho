/**
 * MEMORY-ACL-6 — forget on request, once the owner approves (#101).
 *
 * Anyone may ask (the `memory-forget-me` plugin, from a conversation with
 * them); the ask is a `forget_requests` row (schema v12, ids and timestamps
 * only). The Discord bridge DMs the owner an Approve/Deny card for it
 * (src/discord/forget-card.ts). Nothing is forgotten until the owner presses
 * Approve before the ask expires: no answer, a late answer or Deny is no.
 * On approve every memory row of that person is deleted for good (their
 * profile, notes and private notes, including soft-deleted history) with the
 * turns of their open Discord sessions and their kept conversations (the
 * 30-day condensed summaries and last turns in `conversation_threads`,
 * AGENT-6.a / REQ-discord-472). MEMORY-ACL-4's owner-only `memory-forget` by
 * id stays as it was.
 *
 * MEMORY-ACL-6.a: an ask can also come from GitHub — a declared person
 * (matched by their GitHub numeric id, IDENTITY-7) asks the watch user to
 * forget them (src/watch/forget-me.ts) — or from the owner, who starts one
 * for any declared person with `/admin people forget`. Either way it is the
 * same row and the same card, and nothing is forgotten until the owner
 * approves. Who asked is kept in `requester_user_id` without a schema change
 * ({@link ForgetRequester}): a Discord id (the person themself, as before),
 * `github:<numeric id>:<login>` (the person on GitHub) or `admin:<owner's
 * Discord id>` (the owner via /admin); a GitHub ask's thread is
 * `github:<owner/repo>#<n>` in `origin_channel_id`.
 *
 * SAFE-18..20 (#96): the card is the `forget` kind of the Approve/Deny card
 * engine (src/discord/approval-cards.ts), class destructive, so Approve also
 * needs a one-time code (SAFE-19). `action_hash` (schema v14) records the
 * exact action the card showed — the targets and the counts
 * {@link previewForgetTargets} gives — so Approve never deletes more than
 * the card said: when they changed, nothing is deleted and a fresh card
 * follows ({@link ForgetRequestStore.resetCard}).
 */

import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import type { PeopleDirectory } from "../identity/people.ts";
import { forgetConversations } from "../store/conversation.ts";
import { linkedDiscordIds, personScopeId, type MemorySubject } from "./scope.ts";
import { MemoryStore } from "./store.ts";

/** An ask the owner has not answered in this long is a no. */
export const FORGET_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

export type ForgetRequestStatus = "pending" | "approved" | "denied" | "expired";

/**
 * Who asked (MEMORY-ACL-6 / MEMORY-ACL-6.a): the person themself on Discord,
 * the person themself on GitHub (numeric id and the login they used), or the
 * owner, who started it with `/admin people forget`.
 */
export type ForgetRequester =
  | { via: "discord"; discordId: string }
  | { via: "github"; githubId: string; login: string }
  | { via: "admin"; discordId: string };

/** A GitHub issue or PR thread (`owner/repo`, number). */
export type ForgetGithubThread = { repo: string; number: number };

const GITHUB_REQUESTER_RE = /^github:(\d{1,20}):([a-z0-9](?:[a-z0-9-]{0,38}))$/;
const ADMIN_REQUESTER_RE = /^admin:(\d{1,25})$/;
const GITHUB_ORIGIN_RE = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d{1,10})$/;

/** `requester_user_id` for `r` (no schema change: the kind is a prefix). */
export function encodeForgetRequester(r: ForgetRequester): string {
  if (r.via === "github") return `github:${r.githubId}:${r.login.trim().toLowerCase()}`;
  if (r.via === "admin") return `admin:${r.discordId}`;
  return r.discordId;
}

/** Who asked, from `requester_user_id`; anything else is a Discord id (as before). */
export function parseForgetRequester(raw: string): ForgetRequester {
  const g = GITHUB_REQUESTER_RE.exec(raw);
  if (g) return { via: "github", githubId: g[1]!, login: g[2]! };
  const a = ADMIN_REQUESTER_RE.exec(raw);
  if (a) return { via: "admin", discordId: a[1]! };
  return { via: "discord", discordId: raw };
}

/** `origin_channel_id` of a GitHub ask: its issue or PR thread. */
export function encodeGithubOrigin(t: ForgetGithubThread): string {
  return `github:${t.repo}#${t.number}`;
}

/** The GitHub thread an ask came from, else null (a Discord ask or none). */
export function githubOriginOf(req: Pick<ForgetRequest, "originChannelId">): ForgetGithubThread | null {
  const m = GITHUB_ORIGIN_RE.exec(req.originChannelId ?? "");
  if (!m) return null;
  const repo = m[1]!;
  if (repo.split("/").some((p) => p === "." || p === "..")) return null;
  return { repo, number: Number(m[2]) };
}

/** SAFE-5 actor of an ask's rows: the Discord id, `github:<login>`, or the owner's id. */
export function forgetRequesterActor(r: ForgetRequester): string {
  return r.via === "github" ? `github:${r.login}` : r.discordId;
}

export type ForgetRequest = {
  id: string;
  subjectKind: MemorySubject["kind"];
  /** Declared person id, or the Discord user id of an undeclared asker. */
  subjectId: string;
  /**
   * Who asked, as stored: a Discord user id (the subject's own), or
   * `github:<id>:<login>` / `admin:<owner id>` (MEMORY-ACL-6.a); read it with
   * {@link parseForgetRequester} (also in `requester`).
   */
  requesterUserId: string;
  /** `requesterUserId` read (MEMORY-ACL-6.a). */
  requester: ForgetRequester;
  /**
   * Conversation the ask came from (fallback for the outcome notice), or a
   * GitHub ask's thread `github:<owner/repo>#<n>` ({@link githubOriginOf}).
   */
  originChannelId?: string;
  originParentChannelId?: string;
  status: ForgetRequestStatus;
  createdAt: number;
  expiresAt: number;
  cardChannelId?: string;
  cardMessageId?: string;
  cardPostedAt?: number;
  /** The action hash the card showed (SAFE-18, schema v14). */
  actionHash?: string;
  decidedAt?: number;
  decidedBy?: string;
  forgottenCount?: number;
  notifiedAt?: number;
};

type Row = {
  id: string;
  subject_kind: string;
  subject_id: string;
  requester_user_id: string;
  origin_channel_id: string | null;
  origin_parent_channel_id: string | null;
  status: string;
  created_at: number;
  expires_at: number;
  card_channel_id: string | null;
  card_message_id: string | null;
  card_posted_at: number | null;
  action_hash?: string | null;
  decided_at: number | null;
  decided_by: string | null;
  forgotten_count: number | null;
  notified_at: number | null;
};

function toRequest(r: Row): ForgetRequest {
  const out: ForgetRequest = {
    id: r.id,
    subjectKind: r.subject_kind === "person" ? "person" : "user",
    subjectId: r.subject_id,
    requesterUserId: r.requester_user_id,
    requester: parseForgetRequester(r.requester_user_id),
    status: r.status as ForgetRequestStatus,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
  if (r.origin_channel_id) out.originChannelId = r.origin_channel_id;
  if (r.origin_parent_channel_id) out.originParentChannelId = r.origin_parent_channel_id;
  if (r.card_channel_id) out.cardChannelId = r.card_channel_id;
  if (r.card_message_id) out.cardMessageId = r.card_message_id;
  if (r.card_posted_at != null) out.cardPostedAt = r.card_posted_at;
  if (r.action_hash) out.actionHash = r.action_hash;
  if (r.decided_at != null) out.decidedAt = r.decided_at;
  if (r.decided_by) out.decidedBy = r.decided_by;
  if (r.forgotten_count != null) out.forgottenCount = r.forgotten_count;
  if (r.notified_at != null) out.notifiedAt = r.notified_at;
  return out;
}

/** Short id for buttons and messages (Discord custom_id ≤ 100). */
function newRequestId(): string {
  return `fr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export class ForgetRequestStore {
  private readonly db: Database;
  private readonly now: () => number;

  constructor(opts: { db: Database; now?: () => number }) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
  }

  get(id: string): ForgetRequest | undefined {
    const r = this.db.query(`SELECT * FROM forget_requests WHERE id = ?`).get(id) as Row | null;
    return r ? toRequest(r) : undefined;
  }

  /**
   * Record an ask for `subject`, or return the one still pending (one open
   * ask per person; an expired one is closed first).
   */
  request(input: {
    subject: MemorySubject;
    /** Stored as is: a Discord id, or {@link encodeForgetRequester}'s value. */
    requesterUserId: string;
    originChannelId?: string;
    originParentChannelId?: string;
  }): { request: ForgetRequest; created: boolean } {
    const now = this.now();
    let out: { request: ForgetRequest; created: boolean } | null = null;
    this.db.transaction(() => {
      this.db.run(
        `UPDATE forget_requests SET status = 'expired', decided_at = ?
         WHERE subject_kind = ? AND subject_id = ? AND status = 'pending' AND expires_at <= ?`,
        [now, input.subject.kind, input.subject.id, now],
      );
      const open = this.db
        .query(
          `SELECT * FROM forget_requests WHERE subject_kind = ? AND subject_id = ? AND status = 'pending'`,
        )
        .get(input.subject.kind, input.subject.id) as Row | null;
      if (open) {
        out = { request: toRequest(open), created: false };
        return;
      }
      const id = newRequestId();
      this.db.run(
        `INSERT INTO forget_requests
          (id, subject_kind, subject_id, requester_user_id, origin_channel_id,
           origin_parent_channel_id, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          id,
          input.subject.kind,
          input.subject.id,
          input.requesterUserId,
          input.originChannelId?.trim() || null,
          input.originParentChannelId?.trim() || null,
          now,
          now + FORGET_REQUEST_TTL_MS,
        ],
      );
      out = { request: this.get(id)!, created: true };
    }).immediate();
    return out!;
  }

  /** Pending asks whose card has not gone out yet (and still open). */
  undelivered(now = this.now()): ForgetRequest[] {
    return (
      this.db
        .query(
          `SELECT * FROM forget_requests
           WHERE status = 'pending' AND card_posted_at IS NULL AND expires_at > ?
           ORDER BY created_at`,
        )
        .all(now) as Row[]
    ).map(toRequest);
  }

  /** Pending asks past their expiry (no answer ⇒ no). */
  expiredPending(now = this.now()): ForgetRequest[] {
    return (
      this.db
        .query(
          `SELECT * FROM forget_requests WHERE status = 'pending' AND expires_at <= ? ORDER BY created_at`,
        )
        .all(now) as Row[]
    ).map(toRequest);
  }

  /** Decided asks whose asker has not been told yet. */
  unnotified(): ForgetRequest[] {
    return (
      this.db
        .query(
          `SELECT * FROM forget_requests
           WHERE status <> 'pending' AND notified_at IS NULL ORDER BY decided_at`,
        )
        .all() as Row[]
    ).map(toRequest);
  }

  /**
   * Decided GitHub asks (MEMORY-ACL-6.a) whose asker has not been told yet:
   * the WATCH poller tells them on their thread; the bridge leaves them be.
   */
  unnotifiedGithub(): ForgetRequest[] {
    return this.unnotified().filter((r) => r.requester.via === "github");
  }

  /** The card went out, showing the action `actionHash` binds (SAFE-18). */
  markCardPosted(id: string, channelId: string, messageId: string, actionHash?: string): void {
    this.db.run(
      `UPDATE forget_requests SET card_channel_id = ?, card_message_id = ?, card_posted_at = ?,
         action_hash = ?
       WHERE id = ? AND status = 'pending'`,
      [channelId, messageId, this.now(), actionHash ?? null, id],
    );
  }

  /**
   * What the card showed no longer holds: forget the card, so the next
   * delivery pass sends a fresh one with the current targets and counts.
   */
  resetCard(id: string): void {
    this.db.run(
      `UPDATE forget_requests SET card_channel_id = NULL, card_message_id = NULL,
         card_posted_at = NULL, action_hash = NULL
       WHERE id = ? AND status = 'pending'`,
      [id],
    );
  }

  /**
   * Close a pending ask (compare-and-set on `pending`, so one decision wins).
   * False when it was already closed.
   */
  decide(
    id: string,
    status: Exclude<ForgetRequestStatus, "pending">,
    opts: { by?: string; forgottenCount?: number } = {},
  ): boolean {
    const res = this.db.run(
      `UPDATE forget_requests SET status = ?, decided_at = ?, decided_by = ?, forgotten_count = ?
       WHERE id = ? AND status = 'pending'`,
      [status, this.now(), opts.by ?? null, opts.forgottenCount ?? null, id],
    );
    return Number(res.changes) === 1;
  }

  markNotified(id: string): void {
    this.db.run(`UPDATE forget_requests SET notified_at = ? WHERE id = ? AND notified_at IS NULL`, [
      this.now(),
      id,
    ]);
  }
}

/**
 * GitHub logins that resolve to `personId` now (a login declared for two
 * people matches nobody, IDENTITY-7).
 */
function linkedGithubLogins(dir: PeopleDirectory, personId: string): string[] {
  const person = dir.people.find((p) => p.id === personId);
  return (person?.githubLogins ?? []).filter((login) => dir.byGithubLogin.get(login) === personId);
}

/** GitHub numeric ids that resolve to `personId` now (same rule). */
function linkedGithubIds(dir: PeopleDirectory, personId: string): string[] {
  const person = dir.people.find((p) => p.id === personId);
  return (person?.githubIds ?? []).filter((id) => dir.byGithubId.get(id) === personId);
}

/**
 * What an approved ask deletes: the recorded person's scope and their
 * Discord ids (as linked now, plus the id that asked on Discord), or the
 * undeclared asker's Discord id. A person the owner re-linked since is not
 * widened to whoever their id points at now. `githubLogins` / `githubIds` (a
 * declared person's, as linked now, plus the login and numeric id a GitHub
 * ask came from, MEMORY-ACL-6.a) reach their kept WATCH conversations
 * (AGENT-6.a). The owner who started an ask with `/admin` is never a target.
 */
export function forgetTargets(
  req: Pick<ForgetRequest, "subjectKind" | "subjectId" | "requesterUserId">,
  dir: PeopleDirectory | null | undefined,
): { scopes: string[]; discordIds: string[]; githubLogins: string[]; githubIds: string[] } {
  const asker = parseForgetRequester(req.requesterUserId);
  const discordIds = new Set<string>(asker.via === "discord" ? [asker.discordId] : []);
  const scopes = new Set<string>();
  const githubLogins = new Set<string>(asker.via === "github" ? [asker.login] : []);
  const githubIds = new Set<string>(asker.via === "github" ? [asker.githubId] : []);
  if (req.subjectKind === "person") {
    scopes.add(personScopeId(req.subjectId));
    for (const id of dir ? linkedDiscordIds(dir, req.subjectId) : []) discordIds.add(id);
    for (const login of dir ? linkedGithubLogins(dir, req.subjectId) : []) githubLogins.add(login);
    for (const id of dir ? linkedGithubIds(dir, req.subjectId) : []) githubIds.add(id);
  } else {
    discordIds.add(req.subjectId);
  }
  for (const id of discordIds) scopes.add(id);
  return {
    scopes: [...scopes],
    discordIds: [...discordIds],
    githubLogins: [...githubLogins],
    githubIds: [...githubIds],
  };
}

function tableExists(db: Database, table: string): boolean {
  return (
    db.query("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) != null
  );
}

export type ForgetCounts = { memories: number; turns: number; conversations: number };

/**
 * What {@link forgetMemoryTargets} would delete now, deleting nothing: the
 * same statements run inside an IMMEDIATE transaction that is always rolled
 * back, so the counts on the owner's card are exactly what Approve deletes
 * (SAFE-18).
 */
export function previewForgetTargets(
  db: Database,
  targets: Parameters<typeof forgetMemoryTargets>[1],
): ForgetCounts {
  const rollback = new Error("forget preview: roll back");
  let counts: ForgetCounts = { memories: 0, turns: 0, conversations: 0 };
  try {
    db.transaction(() => {
      counts = forgetMemoryTargets(db, targets);
      throw rollback;
    }).immediate();
  } catch (err) {
    if (err !== rollback) throw err;
  }
  return counts;
}

/**
 * Delete, for good, every memory row of `scopes`, the stored turns of the
 * Discord sessions of `discordIds` (their conversations, MEMORY-1) and their
 * kept conversations (`conversation_threads`: Discord ids, GitHub logins and
 * numeric ids, or holding their words; AGENT-6.a), in one transaction.
 * Returns what was deleted.
 */
export function forgetMemoryTargets(
  db: Database,
  targets: {
    scopes: readonly string[];
    discordIds: readonly string[];
    githubLogins?: readonly string[];
    githubIds?: readonly string[];
  },
): { memories: number; turns: number; conversations: number } {
  let memories = 0;
  let turns = 0;
  let conversations = 0;
  db.transaction(() => {
    memories = new MemoryStore({ db }).purgeScopes(targets.scopes);
    const ids = [...new Set(targets.discordIds.map((s) => s.trim()).filter(Boolean))];
    if (ids.length > 0 && tableExists(db, "discord_session_turns")) {
      const res = db.run(
        `DELETE FROM discord_session_turns WHERE session_id IN
           (SELECT id FROM discord_sessions WHERE user_id IN (${ids.map(() => "?").join(", ")}))`,
        ids,
      );
      turns = Number(res.changes);
    }
    if (tableExists(db, "conversation_threads")) {
      conversations = forgetConversations(db, {
        discordUserIds: ids,
        githubLogins: targets.githubLogins ?? [],
        githubIds: targets.githubIds ?? [],
      });
    }
  }).immediate();
  return { memories, turns, conversations };
}
