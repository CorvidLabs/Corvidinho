/**
 * SAFE-18..20 — approval requests any process can raise (#96,
 * REQ-discord-096).
 *
 * An `approval_requests` row (schema v14) is one Approve/Deny card for the
 * owner: its kind and class (plain | destructive | money; anything else is
 * destructive), the exact action, target and amount shown one line each,
 * the diff or text shown verbatim before the card, the action hash those
 * make up, who asked, the waiting process (`<pid>:<proc start>`, so a card
 * nobody waits for any more is closed as a no) and when it lapses. Every
 * free-text field is SAFE-6 scrubbed before it is stored (and listed in
 * SCRUB_TARGETS). Any process on the data dir records a request (chat and
 * `/work` runs, schedules, WATCH, the CLI); the running Discord bridge DMs
 * the card (src/discord/approval-cards.ts, `storedApprovalKind`) and records
 * the decision, and the waiting process reads it back
 * ({@link ApprovalStore.waitForDecision}) and uses an approval exactly once
 * ({@link ApprovalStore.consume}). No answer, or one after the card lapsed,
 * is a no (SAFE-20).
 */

import { createHash, randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { scrubSecrets } from "../store/scrub.ts";

export type ApprovalClass = "plain" | "destructive" | "money";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "used";

export type ApprovalTextLabel = "diff" | "text";

/** A class as given, or destructive when it is missing or unknown (SAFE-19). */
export function approvalClassOf(raw: unknown): ApprovalClass {
  return raw === "plain" || raw === "money" ? raw : "destructive";
}

/** Destructive and money cards also need a one-time code (SAFE-19). */
export function classNeedsCode(cls: ApprovalClass): boolean {
  return cls !== "plain";
}

/** What a card shows, as it binds the approval (SAFE-18). */
export type ApprovalAction = {
  kind: string;
  class: ApprovalClass;
  action: string;
  target: string;
  amount: string;
  text?: string;
};

/**
 * SHA-256 of the exact action a card shows: kind, class, action, target,
 * amount and the diff or text. A code and an approval count only for it.
 */
export function approvalActionHash(a: ApprovalAction): string {
  return createHash("sha256")
    .update(JSON.stringify(["approval/v1", a.kind, a.class, a.action, a.target, a.amount, a.text ?? null]))
    .digest("hex");
}

export type ApprovalRequest = {
  id: string;
  kind: string;
  class: ApprovalClass;
  title: string;
  action: string;
  target: string;
  amount: string;
  text?: string;
  textLabel?: ApprovalTextLabel;
  actionHash: string;
  requester?: string;
  /** `<pid>:<proc start>` of the process waiting for the answer. */
  waiter?: string;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  cardChannelId?: string;
  cardMessageId?: string;
  cardPostedAt?: number;
  decidedAt?: number;
  decidedBy?: string;
  usedAt?: number;
};

type Row = {
  id: string;
  kind: string;
  class: string;
  title: string;
  action: string;
  target: string;
  amount: string;
  text: string | null;
  text_label: string | null;
  action_hash: string;
  requester: string | null;
  waiter: string | null;
  status: string;
  created_at: number;
  expires_at: number;
  card_channel_id: string | null;
  card_message_id: string | null;
  card_posted_at: number | null;
  decided_at: number | null;
  decided_by: string | null;
  used_at: number | null;
};

function toRequest(r: Row): ApprovalRequest {
  const out: ApprovalRequest = {
    id: r.id,
    kind: r.kind,
    class: approvalClassOf(r.class),
    title: r.title,
    action: r.action,
    target: r.target,
    amount: r.amount,
    actionHash: r.action_hash,
    status: r.status as ApprovalStatus,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
  if (r.text != null) out.text = r.text;
  if (r.text_label === "diff" || r.text_label === "text") out.textLabel = r.text_label;
  if (r.requester) out.requester = r.requester;
  if (r.waiter) out.waiter = r.waiter;
  if (r.card_channel_id) out.cardChannelId = r.card_channel_id;
  if (r.card_message_id) out.cardMessageId = r.card_message_id;
  if (r.card_posted_at != null) out.cardPostedAt = r.card_posted_at;
  if (r.decided_at != null) out.decidedAt = r.decided_at;
  if (r.decided_by) out.decidedBy = r.decided_by;
  if (r.used_at != null) out.usedAt = r.used_at;
  return out;
}

/** Short id for buttons and messages (Discord custom_id ≤ 100). */
function newApprovalId(): string {
  return `ap_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/** The request's action as hashed, from its stored fields. */
export function storedApprovalAction(r: ApprovalRequest): ApprovalAction {
  return {
    kind: r.kind,
    class: r.class,
    action: r.action,
    target: r.target,
    amount: r.amount,
    ...(r.text !== undefined ? { text: r.text } : {}),
  };
}

export type RecordApprovalInput = {
  kind: string;
  /** Missing ⇒ destructive (SAFE-19). */
  class?: ApprovalClass;
  title: string;
  action: string;
  target: string;
  amount: string;
  text?: string;
  textLabel?: ApprovalTextLabel;
  requester?: string;
  waiter?: string;
  /** How long the card stays open (no answer by then ⇒ no). */
  ttlMs: number;
};

export class ApprovalStore {
  private readonly db: Database;
  private readonly now: () => number;

  constructor(opts: { db: Database; now?: () => number }) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
  }

  /** Record a pending request; every free-text field SAFE-6 scrubbed first. */
  request(input: RecordApprovalInput): ApprovalRequest {
    const now = this.now();
    const id = newApprovalId();
    const cls = approvalClassOf(input.class);
    const text = input.text === undefined ? undefined : scrubSecrets(input.text);
    const action: ApprovalAction = {
      kind: input.kind,
      class: cls,
      action: scrubSecrets(input.action),
      target: scrubSecrets(input.target),
      amount: scrubSecrets(input.amount),
      ...(text !== undefined ? { text } : {}),
    };
    this.db.run(
      `INSERT INTO approval_requests
        (id, kind, class, title, action, target, amount, text, text_label, action_hash,
         requester, waiter, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        id,
        input.kind,
        cls,
        scrubSecrets(input.title),
        action.action,
        action.target,
        action.amount,
        text ?? null,
        text === undefined ? null : (input.textLabel ?? "text"),
        approvalActionHash(action),
        input.requester?.trim() || null,
        input.waiter?.trim() || null,
        now,
        now + Math.max(0, input.ttlMs),
      ],
    );
    return this.get(id)!;
  }

  get(id: string): ApprovalRequest | undefined {
    const r = this.db.query(`SELECT * FROM approval_requests WHERE id = ?`).get(id) as Row | null;
    return r ? toRequest(r) : undefined;
  }

  /** Pending requests of `kind` whose card has not gone out yet (and still open). */
  undelivered(kind: string, now = this.now()): ApprovalRequest[] {
    return (
      this.db
        .query(
          `SELECT * FROM approval_requests
           WHERE kind = ? AND status = 'pending' AND card_posted_at IS NULL AND expires_at > ?
           ORDER BY created_at`,
        )
        .all(kind, now) as Row[]
    ).map(toRequest);
  }

  /** Pending requests of `kind` past their expiry (no answer ⇒ no). */
  expiredPending(kind: string, now = this.now()): ApprovalRequest[] {
    return (
      this.db
        .query(
          `SELECT * FROM approval_requests
           WHERE kind = ? AND status = 'pending' AND expires_at <= ? ORDER BY created_at`,
        )
        .all(kind, now) as Row[]
    ).map(toRequest);
  }

  /** Every pending request of `kind`. */
  pending(kind: string): ApprovalRequest[] {
    return (
      this.db
        .query(`SELECT * FROM approval_requests WHERE kind = ? AND status = 'pending' ORDER BY created_at`)
        .all(kind) as Row[]
    ).map(toRequest);
  }

  markCardPosted(id: string, channelId: string, messageId: string): void {
    this.db.run(
      `UPDATE approval_requests SET card_channel_id = ?, card_message_id = ?, card_posted_at = ?
       WHERE id = ? AND status = 'pending'`,
      [channelId, messageId, this.now(), id],
    );
  }

  /** The card went stale: the next delivery pass sends a fresh one. */
  resetCard(id: string): void {
    this.db.run(
      `UPDATE approval_requests SET card_channel_id = NULL, card_message_id = NULL, card_posted_at = NULL
       WHERE id = ? AND status = 'pending'`,
      [id],
    );
  }

  /** Close a pending request (compare-and-set on `pending`, so one decision wins). */
  decide(id: string, status: "approved" | "denied" | "expired", opts: { by?: string } = {}): boolean {
    const res = this.db.run(
      `UPDATE approval_requests SET status = ?, decided_at = ?, decided_by = ?
       WHERE id = ? AND status = 'pending'`,
      [status, this.now(), opts.by ?? null, id],
    );
    return Number(res.changes) === 1;
  }

  /**
   * The waiting process uses an approval once (compare-and-set
   * `approved` → `used`). False when it was not approved, or already used.
   */
  consume(id: string): boolean {
    const res = this.db.run(
      `UPDATE approval_requests SET status = 'used', used_at = ? WHERE id = ? AND status = 'approved'`,
      [this.now(), id],
    );
    return Number(res.changes) === 1;
  }

  /**
   * Wait until the request is decided, polling the shared DB. A request
   * still pending at its expiry, or when `signal` aborts, is closed as
   * `expired` (no answer means no, SAFE-20). Resolves the closed request.
   */
  async waitForDecision(
    id: string,
    opts: { pollMs?: number; signal?: AbortSignal; sleep?: (ms: number) => Promise<void> } = {},
  ): Promise<ApprovalRequest | undefined> {
    const pollMs = Math.max(1, opts.pollMs ?? 1000);
    const sleep = opts.sleep ?? ((ms: number) => Bun.sleep(ms));
    for (;;) {
      const req = this.get(id);
      if (!req || req.status !== "pending") return req;
      if (opts.signal?.aborted || this.now() >= req.expiresAt) {
        this.decide(id, "expired");
        return this.get(id);
      }
      await sleep(Math.min(pollMs, Math.max(1, req.expiresAt - this.now())));
    }
  }
}
