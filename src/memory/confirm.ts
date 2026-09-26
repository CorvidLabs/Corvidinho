/**
 * SAFE-4 two-phase confirm for destructive memory ops (REQ-plugins-011).
 *
 * Phase 1 issues an HMAC token bound to op + actor + memory id + the row's
 * `updated_at` (+ override content hash). Phase 2 must present it from a
 * different process/turn before it expires. Forget/override change the row,
 * so a token is single-use. The secret lives in `schema_meta` (no schema bump).
 */

import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Database } from "bun:sqlite";

export const CONFIRM_TOKEN_TTL_MS = 10 * 60 * 1000;
const SECRET_KEY = "memory_confirm_secret";
const TOKEN_PREFIX = "mc1";

/** One id per process: a Discord message or CLI `plugins run` is a new turn. */
const PROCESS_TURN = randomUUID().replace(/-/g, "").slice(0, 16);
let turnOverride: (() => string) | null = null;

export function currentConfirmTurn(): string {
  return turnOverride?.() ?? PROCESS_TURN;
}

/** Test seam — simulate a new turn without spawning a process. */
export function setConfirmTurnForTests(fn: (() => string) | null): void {
  turnOverride = fn;
}

export type ConfirmOp = "forget" | "override";

export type ConfirmBinding = {
  op: ConfirmOp;
  actorUserId: string;
  memoryId: string;
  /** Row `updated_at` at issue time — any later write invalidates the token. */
  memoryUpdatedAt: number;
  /** Override only: the new content both phases must agree on. */
  content?: string;
};

export type ConfirmCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "malformed" | "mismatch" | "expired" | "same_turn";
      error: string;
    };

function confirmSecret(db: Database): string {
  db.run("INSERT OR IGNORE INTO schema_meta (key, value) VALUES (?, ?)", [
    SECRET_KEY,
    randomBytes(32).toString("hex"),
  ]);
  const row = db
    .query("SELECT value FROM schema_meta WHERE key = ?")
    .get(SECRET_KEY) as { value: string } | null;
  if (!row?.value) throw new Error("memory confirm secret unavailable");
  return row.value;
}

function mac(
  secret: string,
  b: ConfirmBinding,
  expiresAt: number,
  turn: string,
): string {
  const contentHash =
    b.content != null
      ? createHash("sha256").update(b.content).digest("hex")
      : "";
  const payload = JSON.stringify([
    b.op,
    b.actorUserId,
    b.memoryId,
    b.memoryUpdatedAt,
    contentHash,
    expiresAt,
    turn,
  ]);
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function issueConfirmToken(
  db: Database,
  binding: ConfirmBinding,
  now: number = Date.now(),
): { token: string; expiresAt: number } {
  const turn = currentConfirmTurn();
  const expiresAt = now + CONFIRM_TOKEN_TTL_MS;
  const sig = mac(confirmSecret(db), binding, expiresAt, turn);
  return { token: `${TOKEN_PREFIX}.${expiresAt}.${turn}.${sig}`, expiresAt };
}

/**
 * Verify a phase-2 token. Order: shape → HMAC (timing-safe) → expiry →
 * same-turn, so an unauthenticated token never learns anything else.
 */
export function checkConfirmToken(
  db: Database,
  token: string,
  binding: ConfirmBinding,
  now: number = Date.now(),
): ConfirmCheck {
  const parts = (token ?? "").trim().split(".");
  const [prefix, expRaw, turn, sig] = parts;
  const expiresAt = Number(expRaw);
  if (
    parts.length !== 4 ||
    prefix !== TOKEN_PREFIX ||
    !Number.isSafeInteger(expiresAt) ||
    !turn ||
    !/^[0-9a-f]{64}$/.test(sig ?? "")
  ) {
    return {
      ok: false,
      reason: "malformed",
      error: "refused: malformed confirm token — run phase 1 again without --confirm",
    };
  }
  const expected = mac(confirmSecret(db), binding, expiresAt, turn);
  if (!timingSafeEqual(Buffer.from(sig!, "hex"), Buffer.from(expected, "hex"))) {
    return {
      ok: false,
      reason: "mismatch",
      error:
        "refused: confirm token does not match this memory/actor/content, or the memory changed since — run phase 1 again",
    };
  }
  if (now >= expiresAt) {
    return {
      ok: false,
      reason: "expired",
      error: "refused: confirm token expired — run phase 1 again",
    };
  }
  if (turn === currentConfirmTurn()) {
    return {
      ok: false,
      reason: "same_turn",
      error:
        "refused: confirm from a new message/turn, not the one that requested it (SAFE-4 two-phase)",
    };
  }
  return { ok: true };
}
