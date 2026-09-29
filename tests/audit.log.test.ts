/**
 * SAFE-5 tamper-evident audit trail (REQ-plugins-095).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAudit,
  argsDigest,
  auditContextFromEnv,
  auditKeyFromEnv,
  formatAuditLine,
  verifyAudit,
} from "../src/audit/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, register } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { formatStatusReport } from "../src/discord/command-handlers/status.ts";

const entry = (action: string, outcome: "started" | "ok" = "ok") => ({
  action,
  actor: "u1",
  surface: "cli",
  argsDigest: argsDigest(["--id", "x"]),
  outcome,
});

describe("audit chain (SAFE-5)", () => {
  test("unkeyed chain verifies; keyed chain needs the key", () => {
    const db = openCorvidinhoDb({ memory: true });
    appendAudit(db, entry("a"));
    appendAudit(db, entry("b"));
    expect(verifyAudit(db)).toMatchObject({ ok: true, count: 2, unkeyedRows: 2 });

    const keyed = openCorvidinhoDb({ memory: true });
    appendAudit(keyed, entry("a"), { key: "k1-secret" });
    appendAudit(keyed, entry("b"), { key: "k1-secret" });
    expect(verifyAudit(keyed, "k1-secret")).toMatchObject({ ok: true, keyedRows: 2 });
    expect(verifyAudit(keyed)).toMatchObject({ ok: false, keyAvailable: false });
    expect(verifyAudit(keyed, "wrong")).toMatchObject({ ok: false, brokenAtSeq: 1 });
  });

  test("append-only: UPDATE and DELETE are refused by triggers", () => {
    const db = openCorvidinhoDb({ memory: true });
    appendAudit(db, entry("a"));
    expect(() => db.run("UPDATE audit_log SET actor = 'x'")).toThrow(/append-only/);
    expect(() => db.run("DELETE FROM audit_log")).toThrow(/append-only/);
  });

  test("tampering behind the triggers is detected at the first bad row", () => {
    const db = openCorvidinhoDb({ memory: true });
    appendAudit(db, entry("a"), { key: "k" });
    appendAudit(db, entry("b"), { key: "k" });
    appendAudit(db, entry("c"), { key: "k" });
    db.exec("DROP TRIGGER audit_log_no_update");
    db.run("UPDATE audit_log SET actor = 'mallory' WHERE seq = 2");
    const v = verifyAudit(db, "k");
    expect(v.ok).toBe(false);
    expect(v.brokenAtSeq).toBe(2);
    expect(formatAuditLine(v)).toContain("BROKEN at #2");
  });

  test("without a key a tampered unkeyed row reads BROKEN at #N; only a keyed row reads cannot verify", () => {
    const db = openCorvidinhoDb({ memory: true });
    appendAudit(db, entry("a"));
    appendAudit(db, entry("b"));
    appendAudit(db, entry("c"));
    expect(formatAuditLine(verifyAudit(db))).toBe(
      "Audit: 3 entries · chain OK (unkeyed — set CORVIDINHO_AUDIT_HMAC_KEY)",
    );
    db.exec("DROP TRIGGER audit_log_no_update");
    db.run("UPDATE audit_log SET actor = 'someone-else' WHERE seq = 2");
    const v = verifyAudit(db);
    expect(v).toMatchObject({ ok: false, count: 3, keyedRows: 0, keyAvailable: false, brokenAtSeq: 2 });
    expect(formatAuditLine(v)).toBe("Audit: 3 entries · chain BROKEN at #2");
    // The same line as with a key: the break needs no key to be seen.
    expect(formatAuditLine(verifyAudit(db, "k"))).toBe("Audit: 3 entries · chain BROKEN at #2");

    // Unkeyed prefix, then keyed rows (key set later).
    const mixed = openCorvidinhoDb({ memory: true });
    appendAudit(mixed, entry("a"));
    appendAudit(mixed, entry("b"));
    appendAudit(mixed, entry("c"), { key: "k" });
    const keyedLine = "Audit: 3 entries · cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)";
    // Intact prefix: without the key the keyed row cannot be verified.
    expect(formatAuditLine(verifyAudit(mixed))).toBe(keyedLine);
    // A tampered unkeyed row before the first keyed row is a break any reader sees.
    mixed.exec("DROP TRIGGER audit_log_no_update");
    mixed.run("UPDATE audit_log SET actor = 'someone-else' WHERE seq = 1");
    expect(formatAuditLine(verifyAudit(mixed))).toBe("Audit: 3 entries · chain BROKEN at #1");

    // A keyed chain without the key still cannot be verified (fail closed).
    const keyed = openCorvidinhoDb({ memory: true });
    appendAudit(keyed, entry("a"), { key: "k" });
    appendAudit(keyed, entry("b"), { key: "k" });
    const k = verifyAudit(keyed);
    expect(k).toMatchObject({ ok: false, keyedRows: 1, keyAvailable: false, brokenAtSeq: 1 });
    expect(formatAuditLine(k)).toBe(
      "Audit: 2 entries · cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)",
    );
  });
  // REQ-plugins-095: every stored column is part of the link, so an edit to
  // any one of them (behind the dropped trigger) breaks the chain at that row.
  const TAMPER: ReadonlyArray<[column: string, sql: string]> = [
    ["ts", "UPDATE audit_log SET ts = ts + 1 WHERE seq = 2"],
    ["action", "UPDATE audit_log SET action = 'plugins-list' WHERE seq = 2"],
    ["actor", "UPDATE audit_log SET actor = 'mallory' WHERE seq = 2"],
    ["surface", "UPDATE audit_log SET surface = 'discord:sess_x' WHERE seq = 2"],
    ["args_digest", `UPDATE audit_log SET args_digest = '${argsDigest(["--id", "y"])}' WHERE seq = 2`],
    ["outcome", "UPDATE audit_log SET outcome = 'ok' WHERE seq = 2"],
    ["exit_code", "UPDATE audit_log SET exit_code = 0 WHERE seq = 2"],
    ["keyed", "UPDATE audit_log SET keyed = 0 WHERE seq = 2"],
    ["prev_hash", `UPDATE audit_log SET prev_hash = '${"0".repeat(64)}' WHERE seq = 2`],
    ["hash", `UPDATE audit_log SET hash = '${"f".repeat(64)}' WHERE seq = 2`],
  ];
  for (const [column, sql] of TAMPER) {
    test(`tampering with ${column} on row 2 is detected at row 2`, () => {
      const db = openCorvidinhoDb({ memory: true });
      for (const [i, action] of ["a", "b", "c"].entries()) {
        appendAudit(
          db,
          { ...entry(action), outcome: "denied", exitCode: 2 },
          { key: "k", now: 1_000 + i },
        );
      }
      expect(verifyAudit(db, "k")).toMatchObject({ ok: true, count: 3, keyedRows: 3 });
      db.exec("DROP TRIGGER audit_log_no_update");
      db.run(sql);
      const v = verifyAudit(db, "k");
      expect(v).toMatchObject({ ok: false, brokenAtSeq: 2 });
      expect(formatAuditLine(v)).toBe("Audit: 3 entries · chain BROKEN at #2");
    });
  }

  test("status line and context", () => {
    expect(formatAuditLine({ ok: true, count: 0, keyedRows: 0, unkeyedRows: 0, keyAvailable: false })).toBe("Audit: 0 entries");
    expect(formatAuditLine({ ok: true, count: 3, keyedRows: 0, unkeyedRows: 3, keyAvailable: false })).toContain("unkeyed");
    expect(formatAuditLine({ ok: true, count: 3, keyedRows: 3, unkeyedRows: 0, keyAvailable: true })).toContain("chain OK (keyed)");
    expect(auditContextFromEnv({ CORVIDINHO_ACTING_DISCORD_USER_ID: "u9", CORVIDINHO_DISCORD_SESSION_ID: "sess_1" })).toEqual({ actor: "u9", surface: "discord:sess_1" });
    expect(auditContextFromEnv({ CORVIDINHO_WATCH_SESSION_ID: "w1" })).toEqual({ actor: "local", surface: "watch:w1" });
    const body = formatStatusReport({
      version: "0.0.0", protocolVersion: 1, startedAt: 0, now: 0, channelCount: 1,
      sessions: 0, workActive: 0, workDone: 0, workFailed: 0, llmLine: "LLM: -",
      auditLine: "Audit: 2 entries · chain OK (keyed)",
    });
    expect(body).toContain("Audit: 2 entries · chain OK (keyed)");
  });
});

describe("runPlugin records dangerous actions (SAFE-5)", () => {
  let dir = "";
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.CORVIDINHO_DATA_DIR;
    dir = mkdtempSync(join(tmpdir(), "corvidinho-audit-run-"));
    process.env.CORVIDINHO_DATA_DIR = dir;
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    process.env.CORVIDINHO_DATA_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
    clearRegistry();
    loadBuiltins();
  });
  const rows = () => {
    const db = openCorvidinhoDb({});
    const r = db.query("SELECT action, outcome, args_digest FROM audit_log ORDER BY seq").all() as Array<{ action: string; outcome: string; args_digest: string }>;
    db.close();
    return r;
  };

  test("allowed dangerous run: started + ok; raw args never stored", async () => {
    const r = await runPlugin({ name: "danger-ping", args: ["--secret-ish", "hunter2"], nonInteractive: false });
    expect(r.ok).toBe(true);
    const got = rows();
    expect(got.map((x) => `${x.action}:${x.outcome}`)).toEqual(["danger-ping:started", "danger-ping:ok"]);
    expect(got[0]!.args_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(got)).not.toContain("hunter2");
  });

  test("denied dangerous run is logged as a close call; safe plugins are not logged", async () => {
    const denied = await runPlugin({ name: "danger-ping", nonInteractive: true });
    expect(denied.ok).toBe(false);
    await runPlugin({ name: "plugins-list", nonInteractive: true });
    expect(rows().map((x) => `${x.action}:${x.outcome}`)).toEqual(["danger-ping:denied"]);
  });

  test("failing and throwing dangerous runs: started + error with the exit code", async () => {
    register({
      name: "audit-fail-x",
      description: "dangerous test plugin that fails",
      dangerous: true,
      handler: async () => ({ ok: false, error: "boom", exitCode: 3 }),
    });
    register({
      name: "audit-throw-y",
      description: "dangerous test plugin that throws",
      dangerous: true,
      handler: async () => {
        throw new Error("handler threw");
      },
    });
    const failed = await runPlugin({ name: "audit-fail-x", nonInteractive: false });
    expect(failed).toMatchObject({ ok: false, exitCode: 3 });
    await expect(runPlugin({ name: "audit-throw-y", nonInteractive: false })).rejects.toThrow("handler threw");
    const db = openCorvidinhoDb({});
    const got = db
      .query("SELECT action, outcome, exit_code FROM audit_log ORDER BY seq")
      .all() as Array<{ action: string; outcome: string; exit_code: number | null }>;
    expect(verifyAudit(db, auditKeyFromEnv())).toMatchObject({ ok: true, count: 4 });
    db.close();
    expect(got).toEqual([
      { action: "audit-fail-x", outcome: "started", exit_code: null },
      { action: "audit-fail-x", outcome: "error", exit_code: 3 },
      { action: "audit-throw-y", outcome: "started", exit_code: null },
      { action: "audit-throw-y", outcome: "error", exit_code: 1 },
    ]);
  });

  test("fails closed: no audit trail ⇒ dangerous plugin refused, safe plugin still runs", async () => {
    const blocker = join(dir, "not-a-dir");
    writeFileSync(blocker, "x");
    process.env.CORVIDINHO_DATA_DIR = join(blocker, "sub");
    const r = await runPlugin({ name: "danger-ping", nonInteractive: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("audit log unavailable");
    const safe = await runPlugin({ name: "plugins-list", nonInteractive: false });
    expect(safe.ok).toBe(true);
  });
});
