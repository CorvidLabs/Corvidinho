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
  formatAuditLine,
  verifyAudit,
} from "../src/audit/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
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
