/**
 * SAFE-19 — one-time codes for Approve cards (#96, REQ-discord-096).
 *
 * A destructive or money card (src/discord/approval-cards.ts) needs, besides
 * the Approve press, a short code the owner types back. {@link issueCode}
 * makes a random code for one card (kind + request id) and the exact action
 * it showed (its action hash), voiding any code still open for that card,
 * and stores only a salted SHA-256 of it in `approval_codes` (schema v14):
 * the code itself is never stored or logged. {@link verifyAndConsume} checks
 * a typed code (timing-safe) against the card's open codes and uses it up in
 * the same IMMEDIATE transaction: it works once, only for that card and that
 * action hash, and only before it expires (the shorter of
 * {@link APPROVAL_CODE_TTL_MS} and the card's own expiry). A wrong, late or
 * other-action code voids the card's open code, so a new Approve press is
 * needed for another try. {@link voidCodes} voids them when the card is
 * decided or its action changed.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Database } from "bun:sqlite";

/** Characters a code is made of: no I, O, 0 or 1 to misread. */
export const APPROVAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Code length (8 × 5 bits). */
export const APPROVAL_CODE_LENGTH = 8;
/** A code expires this long after it is issued (sooner when the card does). */
export const APPROVAL_CODE_TTL_MS = 2 * 60 * 1000;
/** Used and voided codes are purged this long after they expired. */
export const APPROVAL_CODE_KEEP_MS = 24 * 60 * 60 * 1000;

export type ApprovalCodeRef = {
  /** Card kind (`forget`, …). */
  kind: string;
  /** The card's request id. */
  requestId: string;
};

export type IssuedCode = { code: string; expiresAt: number };

/**
 * Why a typed code did not count: no open code for the card, the code is not
 * the card's, it was issued for a different action, or it expired.
 */
export type CodeRefusal = "none" | "wrong" | "other-action" | "expired";

export type CodeCheck = { ok: true } | { ok: false; reason: CodeRefusal };

type CodeRow = {
  id: number;
  action_hash: string;
  salt: string;
  code_hash: string;
  expires_at: number;
};

function digest(salt: string, code: string): Buffer {
  return createHash("sha256").update(`${salt}\u0000${code}`).digest();
}

/** A typed code as compared: upper case, spaces and dashes dropped. */
export function normalizeApprovalCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toUpperCase().replace(/[\s-]+/g, "").slice(0, 64);
}

function newCode(): string {
  let code = "";
  for (let i = 0; i < APPROVAL_CODE_LENGTH; i++) {
    code += APPROVAL_CODE_ALPHABET[randomInt(APPROVAL_CODE_ALPHABET.length)];
  }
  return code;
}

/** Void every code still open for the card. Returns how many. */
export function voidCodes(db: Database, ref: ApprovalCodeRef, now = Date.now()): number {
  const res = db.run(
    `UPDATE approval_codes SET voided_at = ?
     WHERE kind = ? AND request_id = ? AND used_at IS NULL AND voided_at IS NULL`,
    [now, ref.kind, ref.requestId],
  );
  return Number(res.changes);
}

/**
 * Issue a new code for the card and the action hash it shows, voiding any
 * code still open for it (one live code per card). Expires at the shorter of
 * `ttlMs` from now and `cardExpiresAt`.
 */
export function issueCode(
  db: Database,
  opts: ApprovalCodeRef & {
    actionHash: string;
    cardExpiresAt: number;
    now?: number;
    ttlMs?: number;
  },
): IssuedCode {
  const now = opts.now ?? Date.now();
  const expiresAt = Math.min(now + (opts.ttlMs ?? APPROVAL_CODE_TTL_MS), opts.cardExpiresAt);
  const code = newCode();
  const salt = randomBytes(16).toString("hex");
  db.transaction(() => {
    voidCodes(db, opts, now);
    db.run(
      `INSERT INTO approval_codes
        (kind, request_id, action_hash, salt, code_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [opts.kind, opts.requestId, opts.actionHash, salt, digest(salt, code).toString("hex"), now, expiresAt],
    );
  }).immediate();
  return { code, expiresAt };
}

/**
 * Check a typed code for the card and the action it shows now, and use it up
 * when it is right: single use (compare-and-set on `used_at`), only for this
 * card and `actionHash`, only before it expires. Anything else voids the
 * card's open code and counts for nothing.
 */
export function verifyAndConsume(
  db: Database,
  opts: ApprovalCodeRef & { actionHash: string; code: unknown; now?: number },
): CodeCheck {
  const now = opts.now ?? Date.now();
  const typed = normalizeApprovalCode(opts.code);
  let out: CodeCheck = { ok: false, reason: "none" };
  db.transaction(() => {
    const rows = db
      .query(
        `SELECT id, action_hash, salt, code_hash, expires_at FROM approval_codes
         WHERE kind = ? AND request_id = ? AND used_at IS NULL AND voided_at IS NULL`,
      )
      .all(opts.kind, opts.requestId) as CodeRow[];
    if (rows.length === 0) return;
    let match: CodeRow | null = null;
    for (const row of rows) {
      const want = Buffer.from(row.code_hash, "hex");
      const got = digest(row.salt, typed);
      if (want.length === got.length && timingSafeEqual(want, got)) match = row;
    }
    const refuse = (reason: CodeRefusal) => {
      voidCodes(db, opts, now);
      out = { ok: false, reason };
    };
    if (!match) return refuse("wrong");
    if (match.action_hash !== opts.actionHash) return refuse("other-action");
    if (match.expires_at <= now) return refuse("expired");
    const used = db.run(
      `UPDATE approval_codes SET used_at = ? WHERE id = ? AND used_at IS NULL AND voided_at IS NULL`,
      [now, match.id],
    );
    if (Number(used.changes) !== 1) return refuse("none");
    voidCodes(db, opts, now);
    out = { ok: true };
  }).immediate();
  return out;
}

/** Delete codes that expired more than {@link APPROVAL_CODE_KEEP_MS} ago. */
export function purgeOldCodes(db: Database, now = Date.now()): number {
  return Number(
    db.run(`DELETE FROM approval_codes WHERE expires_at < ?`, [now - APPROVAL_CODE_KEEP_MS]).changes,
  );
}
