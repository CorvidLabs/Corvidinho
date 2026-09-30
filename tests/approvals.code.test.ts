/**
 * SAFE-19 (#96, REQ-discord-096) — one-time codes (src/approvals/code.ts):
 * valid once, only for the card and the exact action it was issued for,
 * and only until it expires (the shorter of 2 minutes and the card's own
 * expiry); a wrong, other-action or late code voids the open code; only a
 * salted hash is stored. In-memory SQLite, fixed clock.
 */
import { describe, expect, test } from "bun:test";
import {
  APPROVAL_CODE_ALPHABET,
  APPROVAL_CODE_KEEP_MS,
  APPROVAL_CODE_LENGTH,
  APPROVAL_CODE_TTL_MS,
  issueCode,
  normalizeApprovalCode,
  purgeOldCodes,
  verifyAndConsume,
  voidCodes,
} from "../src/approvals/code.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const T0 = 1_800_000_000_000;
const CARD_EXPIRES = T0 + 60 * 60 * 1000;
const H1 = "a".repeat(64);
const H2 = "b".repeat(64);

function db() {
  return openCorvidinhoDb({ memory: true });
}

function rows(d: ReturnType<typeof db>) {
  return d.query("SELECT * FROM approval_codes ORDER BY id").all() as Array<Record<string, unknown>>;
}

describe("issueCode", () => {
  test("a short random code from the unambiguous alphabet; only a salted hash is stored; expires at the shorter of 2 minutes and the card", () => {
    const d = db();
    try {
      const a = issueCode(d, { kind: "forget", requestId: "fr_a", actionHash: H1, cardExpiresAt: CARD_EXPIRES, now: T0 });
      expect(a.code).toHaveLength(APPROVAL_CODE_LENGTH);
      for (const ch of a.code) expect(APPROVAL_CODE_ALPHABET).toContain(ch);
      expect(a.expiresAt).toBe(T0 + APPROVAL_CODE_TTL_MS);
      // A card that lapses sooner caps the code.
      const b = issueCode(d, { kind: "forget", requestId: "fr_b", actionHash: H1, cardExpiresAt: T0 + 30_000, now: T0 });
      expect(b.expiresAt).toBe(T0 + 30_000);
      const stored = JSON.stringify(rows(d));
      expect(stored).not.toContain(a.code);
      expect(stored).not.toContain(b.code);
      expect(rows(d).map((r) => [r.kind, r.request_id, r.action_hash])).toEqual([
        ["forget", "fr_a", H1],
        ["forget", "fr_b", H1],
      ]);
      expect(rows(d).every((r) => typeof r.salt === "string" && (r.salt as string).length === 32)).toBe(true);
      // Two codes for the same card: only the newest is open.
      const a2 = issueCode(d, { kind: "forget", requestId: "fr_a", actionHash: H1, cardExpiresAt: CARD_EXPIRES, now: T0 + 1 });
      expect(verifyAndConsume(d, { kind: "forget", requestId: "fr_a", actionHash: H1, code: a.code, now: T0 + 2 })).toEqual({
        ok: false,
        reason: "wrong",
      });
      // …and that wrong try voided the newest one too.
      expect(verifyAndConsume(d, { kind: "forget", requestId: "fr_a", actionHash: H1, code: a2.code, now: T0 + 3 })).toEqual({
        ok: false,
        reason: "none",
      });
    } finally {
      d.close();
    }
  });
});

describe("verifyAndConsume", () => {
  test("the right code counts once (typed in any case, with spaces or dashes)", () => {
    const d = db();
    try {
      const c = issueCode(d, { kind: "forget", requestId: "fr_a", actionHash: H1, cardExpiresAt: CARD_EXPIRES, now: T0 });
      const typed = ` ${c.code.slice(0, 4).toLowerCase()}-${c.code.slice(4)} `;
      expect(normalizeApprovalCode(typed)).toBe(c.code);
      expect(verifyAndConsume(d, { kind: "forget", requestId: "fr_a", actionHash: H1, code: typed, now: T0 + 1 })).toEqual({ ok: true });
      expect(rows(d)[0]!.used_at).toBe(T0 + 1);
      // Used: never again.
      expect(verifyAndConsume(d, { kind: "forget", requestId: "fr_a", actionHash: H1, code: c.code, now: T0 + 2 })).toEqual({
        ok: false,
        reason: "none",
      });
    } finally {
      d.close();
    }
  });

  test("only for that card and that action: another card, another kind or another action hash does not take it", () => {
    const d = db();
    try {
      const a = issueCode(d, { kind: "forget", requestId: "fr_a", actionHash: H1, cardExpiresAt: CARD_EXPIRES, now: T0 });
      issueCode(d, { kind: "forget", requestId: "fr_b", actionHash: H1, cardExpiresAt: CARD_EXPIRES, now: T0 });
      // Card B's form with card A's code: not B's code; B's own is voided.
      expect(verifyAndConsume(d, { kind: "forget", requestId: "fr_b", actionHash: H1, code: a.code, now: T0 + 1 })).toEqual({
        ok: false,
        reason: "wrong",
      });
      // Another kind with the same request id has no code at all.
      expect(verifyAndConsume(d, { kind: "spend", requestId: "fr_a", actionHash: H1, code: a.code, now: T0 + 1 })).toEqual({
        ok: false,
        reason: "none",
      });
      // Card A, but the action it shows changed since: the code was for the old one.
      expect(verifyAndConsume(d, { kind: "forget", requestId: "fr_a", actionHash: H2, code: a.code, now: T0 + 1 })).toEqual({
        ok: false,
        reason: "other-action",
      });
      // That try voided it: the old action cannot use it either now.
      expect(verifyAndConsume(d, { kind: "forget", requestId: "fr_a", actionHash: H1, code: a.code, now: T0 + 2 })).toEqual({
        ok: false,
        reason: "none",
      });
    } finally {
      d.close();
    }
  });

  test("a late code is refused and voided; voidCodes closes open codes; old codes are purged", () => {
    const d = db();
    try {
      const c = issueCode(d, { kind: "forget", requestId: "fr_a", actionHash: H1, cardExpiresAt: CARD_EXPIRES, now: T0 });
      expect(verifyAndConsume(d, { kind: "forget", requestId: "fr_a", actionHash: H1, code: c.code, now: c.expiresAt })).toEqual({
        ok: false,
        reason: "expired",
      });
      expect(rows(d)[0]!.voided_at).toBe(c.expiresAt);
      const c2 = issueCode(d, { kind: "forget", requestId: "fr_a", actionHash: H1, cardExpiresAt: CARD_EXPIRES, now: T0 });
      expect(voidCodes(d, { kind: "forget", requestId: "fr_a" }, T0 + 1)).toBe(1);
      expect(verifyAndConsume(d, { kind: "forget", requestId: "fr_a", actionHash: H1, code: c2.code, now: T0 + 2 })).toEqual({
        ok: false,
        reason: "none",
      });
      expect(purgeOldCodes(d, T0)).toBe(0);
      expect(purgeOldCodes(d, T0 + APPROVAL_CODE_TTL_MS + APPROVAL_CODE_KEEP_MS + 1)).toBe(2);
      expect(rows(d)).toEqual([]);
      // Junk input is just a wrong code.
      issueCode(d, { kind: "forget", requestId: "fr_a", actionHash: H1, cardExpiresAt: CARD_EXPIRES, now: T0 });
      expect(verifyAndConsume(d, { kind: "forget", requestId: "fr_a", actionHash: H1, code: undefined, now: T0 + 1 })).toEqual({
        ok: false,
        reason: "wrong",
      });
    } finally {
      d.close();
    }
  });
});
