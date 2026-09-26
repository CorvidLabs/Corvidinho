/**
 * SAFE-4 confirm tokens for memory forget/override (REQ-plugins-011).
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  CONFIRM_TOKEN_TTL_MS,
  checkConfirmToken,
  issueConfirmToken,
  setConfirmTurnForTests,
  type ConfirmBinding,
} from "../src/memory/index.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const base: ConfirmBinding = {
  op: "forget",
  actorUserId: "boss",
  memoryId: "m1",
  memoryUpdatedAt: 1000,
};

afterEach(() => setConfirmTurnForTests(null));

describe("memory confirm tokens (SAFE-4)", () => {
  test("valid from a new turn before expiry", () => {
    const db = openCorvidinhoDb({ memory: true });
    setConfirmTurnForTests(() => "t1");
    const { token, expiresAt } = issueConfirmToken(db, base, 5_000);
    expect(expiresAt).toBe(5_000 + CONFIRM_TOKEN_TTL_MS);
    setConfirmTurnForTests(() => "t2");
    expect(checkConfirmToken(db, token, base, 6_000)).toEqual({ ok: true });
  });

  test("same turn, expiry, malformed, and tampering are refused", () => {
    const db = openCorvidinhoDb({ memory: true });
    setConfirmTurnForTests(() => "t1");
    const { token } = issueConfirmToken(db, base, 0);
    const same = checkConfirmToken(db, token, base, 1);
    expect(same.ok ? "ok" : same.reason).toBe("same_turn");

    setConfirmTurnForTests(() => "t2");
    const late = checkConfirmToken(db, token, base, CONFIRM_TOKEN_TTL_MS);
    expect(late.ok ? "ok" : late.reason).toBe("expired");

    for (const bad of ["", "mc1", "mc1.x.t1.abc", "zz1.1.t1." + "0".repeat(64)]) {
      const r = checkConfirmToken(db, bad, base, 1);
      expect(r.ok ? "ok" : r.reason).toBe("malformed");
    }

    // Forged turn or expiry → HMAC mismatch.
    const [p, exp, , sig] = token.split(".");
    const forgedTurn = checkConfirmToken(db, `${p}.${exp}.t2.${sig}`, base, 1);
    expect(forgedTurn.ok ? "ok" : forgedTurn.reason).toBe("mismatch");
    const forgedExp = checkConfirmToken(db, `${p}.${Number(exp) + 10_000_000}.t1.${sig}`, base, 1);
    expect(forgedExp.ok ? "ok" : forgedExp.reason).toBe("mismatch");
  });

  test("binding covers op, actor, id, updatedAt, and content", () => {
    const db = openCorvidinhoDb({ memory: true });
    setConfirmTurnForTests(() => "t1");
    const { token } = issueConfirmToken(db, { ...base, op: "override", content: "x" }, 0);
    setConfirmTurnForTests(() => "t2");
    const variants: ConfirmBinding[] = [
      { ...base, op: "forget", content: "x" },
      { ...base, op: "override", actorUserId: "other", content: "x" },
      { ...base, op: "override", memoryId: "m2", content: "x" },
      { ...base, op: "override", memoryUpdatedAt: 1001, content: "x" },
      { ...base, op: "override", content: "y" },
    ];
    for (const v of variants) {
      const r = checkConfirmToken(db, token, v, 1);
      expect(r.ok ? "ok" : r.reason).toBe("mismatch");
    }
    expect(
      checkConfirmToken(db, token, { ...base, op: "override", content: "x" }, 1),
    ).toEqual({ ok: true });
  });

  test("secret is created once and persists in schema_meta", () => {
    const db = openCorvidinhoDb({ memory: true });
    setConfirmTurnForTests(() => "t1");
    const a = issueConfirmToken(db, base, 0).token;
    const b = issueConfirmToken(db, base, 0).token;
    expect(a).toBe(b);
    const rows = db
      .query("SELECT COUNT(*) AS c FROM schema_meta WHERE key = 'memory_confirm_secret'")
      .get() as { c: number };
    expect(rows.c).toBe(1);
    const other = openCorvidinhoDb({ memory: true });
    setConfirmTurnForTests(() => "t2");
    const r = checkConfirmToken(other, a, base, 1);
    expect(r.ok ? "ok" : r.reason).toBe("mismatch");
  });
});
