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
 * turns of their open Discord sessions. MEMORY-ACL-4's owner-only
 * `memory-forget` by id stays as it was.
 */

import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import type { PeopleDirectory } from "../identity/people.ts";
import { linkedDiscordIds, personScopeId, type MemorySubject } from "./scope.ts";
import { MemoryStore } from "./store.ts";

/** An ask the owner has not answered in this long is a no. */
export const FORGET_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

export type ForgetRequestStatus = "pending" | "approved" | "denied" | "expired";

export type ForgetRequest = {
  id: string;
  subjectKind: MemorySubject["kind"];
  /** Declared person id, or the Discord user id of an undeclared asker. */
  subjectId: string;
  /** Discord user id that asked (always the subject's own). */
  requesterUserId: string;
  /** Conversation the ask came from (fallback for the outcome notice). */
  originChannelId?: string;
  originParentChannelId?: string;
  status: ForgetRequestStatus;
  createdAt: number;
  expiresAt: number;
  cardChannelId?: string;
  cardMessageId?: string;
  cardPostedAt?: number;
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
    status: r.status as ForgetRequestStatus,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
  if (r.origin_channel_id) out.originChannelId = r.origin_channel_id;
  if (r.origin_parent_channel_id) out.originParentChannelId = r.origin_parent_channel_id;
  if (r.card_channel_id) out.cardChannelId = r.card_channel_id;
  if (r.card_message_id) out.cardMessageId = r.card_message_id;
  if (r.card_posted_at != null) out.cardPostedAt = r.card_posted_at;
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

  markCardPosted(id: string, channelId: string, messageId: string): void {
    this.db.run(
      `UPDATE forget_requests SET card_channel_id = ?, card_message_id = ?, card_posted_at = ?
       WHERE id = ? AND status = 'pending'`,
      [channelId, messageId, this.now(), id],
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
 * What an approved ask deletes: the recorded person's scope and their
 * Discord ids (as linked now, plus the id that asked), or the undeclared
 * asker's Discord id. A person the owner re-linked since is not widened to
 * whoever their id points at now.
 */
export function forgetTargets(
  req: Pick<ForgetRequest, "subjectKind" | "subjectId" | "requesterUserId">,
  dir: PeopleDirectory | null | undefined,
): { scopes: string[]; discordIds: string[] } {
  const discordIds = new Set<string>([req.requesterUserId]);
  const scopes = new Set<string>();
  if (req.subjectKind === "person") {
    scopes.add(personScopeId(req.subjectId));
    for (const id of dir ? linkedDiscordIds(dir, req.subjectId) : []) discordIds.add(id);
  } else {
    discordIds.add(req.subjectId);
  }
  for (const id of discordIds) scopes.add(id);
  return { scopes: [...scopes], discordIds: [...discordIds] };
}

function tableExists(db: Database, table: string): boolean {
  return (
    db.query("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) != null
  );
}

/**
 * Delete, for good, every memory row of `scopes` and the stored turns of the
 * Discord sessions of `discordIds` (their conversations, MEMORY-1), in one
 * transaction. Returns what was deleted.
 */
export function forgetMemoryTargets(
  db: Database,
  targets: { scopes: readonly string[]; discordIds: readonly string[] },
): { memories: number; turns: number } {
  let memories = 0;
  let turns = 0;
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
  }).immediate();
  return { memories, turns };
}
