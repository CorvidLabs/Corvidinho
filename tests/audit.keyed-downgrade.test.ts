/**
 * SAFE-5 / REQ-plugins-095: once the audit chain is keyed it stays keyed.
 * A DB writer without the HMAC key must not be able to edit a keyed row and
 * relink the tail as unkeyed SHA-256 links that verify as "chain OK".
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import {
  appendAudit,
  argsDigest,
  formatAuditLine,
  verifyAudit,
} from "../src/audit/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const KEY = "audit-hmac-test-key";
const GENESIS = "0".repeat(64);

const entry = (action: string, actor = "u1") => ({
  action,
  actor,
  surface: "cli",
  argsDigest: argsDigest(["--id", "x"]),
  outcome: "ok" as const,
});

type Row = {
  seq: number;
  ts: number;
  action: string;
  actor: string;
  surface: string;
  args_digest: string;
  outcome: string;
  exit_code: number | null;
  keyed: number;
  prev_hash: string;
  hash: string;
};

/** Attacker with DB write access but no key: plain SHA-256 relink. */
function sha256Link(prev: string, r: Row): string {
  const payload = JSON.stringify([
    r.ts, r.action, r.actor, r.surface, r.args_digest, r.outcome, r.exit_code, 0,
  ]);
  return createHash("sha256").update(`${prev}|${payload}`).digest("hex");
}

function downgradeFrom(db: Database, fromSeq: number, edit: (r: Row) => void): void {
  db.exec("DROP TRIGGER audit_log_no_update");
  const rows = db.query("SELECT * FROM audit_log ORDER BY seq ASC").all() as Row[];
  let prev = GENESIS;
  for (const r of rows) {
    if (r.seq >= fromSeq) {
      if (r.seq === fromSeq) edit(r);
      const hash = sha256Link(prev, r);
      db.run(
        "UPDATE audit_log SET actor = ?, keyed = 0, prev_hash = ?, hash = ? WHERE seq = ?",
        [r.actor, prev, hash, r.seq],
      );
      prev = hash;
    } else {
      prev = r.hash;
    }
  }
}

describe("audit chain keyed downgrade (SAFE-5)", () => {
  test("keyed rows relinked as unkeyed SHA-256 fail verify with the key", () => {
    const db = openCorvidinhoDb({ memory: true });
    appendAudit(db, entry("memory-forget"), { key: KEY });
    appendAudit(db, entry("memory-forget", "222"), { key: KEY });
    appendAudit(db, entry("memory-forget"), { key: KEY });
    expect(formatAuditLine(verifyAudit(db, KEY))).toBe("Audit: 3 entries · chain OK (keyed)");

    downgradeFrom(db, 2, (r) => {
      r.actor = "111";
    });
    const row2 = db.query("SELECT actor FROM audit_log WHERE seq = 2").get() as { actor: string };
    expect(row2.actor).toBe("111");

    const v = verifyAudit(db, KEY);
    expect(v).toMatchObject({ ok: false, keyAvailable: true, brokenAtSeq: 2 });
    expect(formatAuditLine(v)).toBe("Audit: 3 entries · chain BROKEN at #2");
  });

  test("after a legacy unkeyed prefix, a keyed row relinked unkeyed behind a keyed row fails verify", () => {
    const db = openCorvidinhoDb({ memory: true });
    appendAudit(db, entry("a"));
    appendAudit(db, entry("b"));
    appendAudit(db, entry("memory-forget"), { key: KEY });
    appendAudit(db, entry("memory-forget", "222"), { key: KEY });
    expect(formatAuditLine(verifyAudit(db, KEY))).toBe(
      "Audit: 4 entries · chain OK (mixed keyed/unkeyed)",
    );

    downgradeFrom(db, 4, (r) => {
      r.actor = "111";
    });
    const v = verifyAudit(db, KEY);
    expect(v).toMatchObject({ ok: false, keyAvailable: true, brokenAtSeq: 4 });
    expect(formatAuditLine(v)).toBe("Audit: 4 entries · chain BROKEN at #4");
  });

  test("an unkeyed append after a keyed row is refused, so the chain stays verifiable", () => {
    const db = openCorvidinhoDb({ memory: true });
    appendAudit(db, entry("a"), { key: KEY });
    expect(() => appendAudit(db, entry("b"))).toThrow(/keyed/);
    expect(verifyAudit(db, KEY)).toMatchObject({ ok: true, count: 1, keyedRows: 1, unkeyedRows: 0 });
  });

  test("a legacy unkeyed prefix followed by keyed rows still verifies (mixed)", () => {
    const db = openCorvidinhoDb({ memory: true });
    appendAudit(db, entry("a"));
    appendAudit(db, entry("b"));
    appendAudit(db, entry("c"), { key: KEY });
    const v = verifyAudit(db, KEY);
    expect(v).toMatchObject({ ok: true, count: 3, keyedRows: 1, unkeyedRows: 2 });
    expect(formatAuditLine(v)).toBe("Audit: 3 entries · chain OK (mixed keyed/unkeyed)");
  });
});

describe("runPlugin on a keyed chain without the key (SAFE-5)", () => {
  let dir = "";
  const saved: Record<string, string | undefined> = {};
  const keys = ["CORVIDINHO_DATA_DIR", "CORVIDINHO_AUDIT_HMAC_KEY"] as const;
  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k];
    dir = mkdtempSync(join(tmpdir(), "corvidinho-audit-downgrade-"));
    process.env.CORVIDINHO_DATA_DIR = dir;
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test("a keyless dangerous run is refused (fail closed) and the chain stays keyed", async () => {
    process.env.CORVIDINHO_AUDIT_HMAC_KEY = KEY;
    expect((await runPlugin({ name: "danger-ping", nonInteractive: false })).ok).toBe(true);
    delete process.env.CORVIDINHO_AUDIT_HMAC_KEY;
    const r = await runPlugin({ name: "danger-ping", nonInteractive: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("audit log unavailable");
    const db = openCorvidinhoDb({});
    try {
      expect(verifyAudit(db, KEY)).toMatchObject({ ok: true, count: 2, keyedRows: 2, unkeyedRows: 0 });
    } finally {
      db.close();
    }
  });
});
