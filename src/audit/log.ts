/**
 * SAFE-5 — tamper-evident audit trail for destructive / dangerous actions.
 *
 * Append-only `audit_log` (UPDATE/DELETE blocked by triggers) holding a hash
 * chain. With CORVIDINHO_AUDIT_HMAC_KEY set on the bot VM each link is an
 * HMAC-SHA256, so someone who can write the DB but not read the VM env cannot
 * re-sign the chain. Without a key the chain is plain SHA-256 (integrity only)
 * and verify says so. Once a keyed row exists the chain stays keyed: an
 * unkeyed row after it is refused on append and fails verify, so a keyed row
 * cannot be relinked as plain SHA-256 while a keyed row before it stays.
 * Rewriting every keyed row as unkeyed, or dropping the newest rows, is not
 * detectable from the DB alone (that needs an anchor outside the DB). Rows
 * hold ids, digests and outcomes — never raw args or memory content.
 */

import { createHash, createHmac } from "node:crypto";
import type { Database } from "bun:sqlite";
import { retryWhileBusy } from "../store/db.ts";

const GENESIS = "0".repeat(64);

export type AuditOutcome = "started" | "ok" | "error" | "denied";

export type AuditEntryInput = {
  /** Plugin/command name, e.g. "memory-forget". */
  action: string;
  /** Acting principal: Discord user id, `github:<id or login>` on WATCH, or "local". */
  actor: string;
  /** Where it came from: "discord:<session>", "watch:<session>", "cli". */
  surface: string;
  /** SHA-256 of the argv — never the raw args. */
  argsDigest: string;
  outcome: AuditOutcome;
  exitCode?: number;
};

export type AuditVerify = {
  ok: boolean;
  count: number;
  keyedRows: number;
  unkeyedRows: number;
  /** A key is needed to verify keyed rows. */
  keyAvailable: boolean;
  brokenAtSeq?: number;
};

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

/** Bot-VM secret (ALLOW-4); never stored in the DB next to the chain. */
export function auditKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const k = env.CORVIDINHO_AUDIT_HMAC_KEY?.trim();
  return k ? k : undefined;
}

export function argsDigest(args: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

function link(
  key: string | undefined,
  prev: string,
  row: Omit<Row, "seq" | "prev_hash" | "hash">,
): string {
  const payload = JSON.stringify([
    row.ts,
    row.action,
    row.actor,
    row.surface,
    row.args_digest,
    row.outcome,
    row.exit_code,
    row.keyed,
  ]);
  const data = `${prev}|${payload}`;
  return key
    ? createHmac("sha256", key).update(data).digest("hex")
    : createHash("sha256").update(data).digest("hex");
}

/**
 * Append one entry; returns its sequence number and hash. Takes the write
 * lock up front (BEGIN IMMEDIATE) so a concurrent writer is waited for under
 * busy_timeout; a deferred read-then-write gets SQLITE_BUSY at once instead.
 * The lock is tried every millisecond (retryWhileBusy), so writers that
 * commit back to back cannot pass this append over for the whole
 * busy_timeout. Inside a caller's transaction it is a savepoint of that
 * transaction.
 */
export function appendAudit(
  db: Database,
  entry: AuditEntryInput,
  opts: { key?: string; now?: number } = {},
): { seq: number; hash: string } {
  const key = opts.key;
  let seq = 0;
  let hash = "";
  const write = db.transaction(() => {
    const last = db
      .query("SELECT hash, keyed FROM audit_log ORDER BY seq DESC LIMIT 1")
      .get() as { hash: string; keyed: number } | null;
    if (last?.keyed && !key) {
      throw new Error(
        "audit chain is keyed; appending needs CORVIDINHO_AUDIT_HMAC_KEY (SAFE-5)",
      );
    }
    const prev = last?.hash ?? GENESIS;
    const row = {
      ts: opts.now ?? Date.now(),
      action: entry.action,
      actor: entry.actor,
      surface: entry.surface,
      args_digest: entry.argsDigest,
      outcome: entry.outcome,
      exit_code: entry.exitCode ?? null,
      keyed: key ? 1 : 0,
    };
    hash = link(key, prev, row);
    const res = db.run(
      `INSERT INTO audit_log
        (ts, action, actor, surface, args_digest, outcome, exit_code, keyed, prev_hash, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.ts,
        row.action,
        row.actor,
        row.surface,
        row.args_digest,
        row.outcome,
        row.exit_code,
        row.keyed,
        prev,
        hash,
      ],
    );
    seq = Number(res.lastInsertRowid);
  });
  const own = !db.inTransaction;
  // Only the BEGIN is retried; the commit keeps busy_timeout (a committing
  // writer blocks new readers, so its wait for current ones is short).
  if (own) retryWhileBusy(db, () => db.exec("BEGIN IMMEDIATE"));
  try {
    write();
    if (own) db.exec("COMMIT");
  } catch (err) {
    if (own && db.inTransaction) db.exec("ROLLBACK");
    throw err;
  }
  return { seq, hash };
}

/**
 * Recompute the chain. Keyed rows need the key; without it they cannot be
 * verified and the result is not ok (fail closed). An unkeyed row after a
 * keyed row is a break: only a writer without the key would produce one.
 */
export function verifyAudit(db: Database, key?: string): AuditVerify {
  const rows = db.query("SELECT * FROM audit_log ORDER BY seq ASC").all() as Row[];
  let prev = GENESIS;
  let keyedRows = 0;
  let unkeyedRows = 0;
  for (const r of rows) {
    if (r.keyed) keyedRows += 1;
    else unkeyedRows += 1;
    if (r.keyed && !key) {
      return { ok: false, count: rows.length, keyedRows, unkeyedRows, keyAvailable: false, brokenAtSeq: r.seq };
    }
    const expect = link(r.keyed ? key : undefined, prev, r);
    const downgraded = !r.keyed && keyedRows > 0;
    if (downgraded || r.prev_hash !== prev || r.hash !== expect) {
      return { ok: false, count: rows.length, keyedRows, unkeyedRows, keyAvailable: Boolean(key), brokenAtSeq: r.seq };
    }
    prev = r.hash;
  }
  return { ok: true, count: rows.length, keyedRows, unkeyedRows, keyAvailable: Boolean(key) };
}

/**
 * One-line human summary for /status and startup logs. A failed verify
 * counts rows only up to the row it stopped at, so without a key
 * `keyedRows === 0` means it broke before any keyed row: a tampered unkeyed
 * row, verified without the key, reads BROKEN like any break. Only stopping
 * at a keyed row without the key reads "cannot verify keyed rows".
 */
export function formatAuditLine(v: AuditVerify): string {
  if (v.count === 0) return "Audit: 0 entries";
  if (!v.ok) {
    return v.keyAvailable || v.keyedRows === 0
      ? `Audit: ${v.count} entries · chain BROKEN at #${v.brokenAtSeq}`
      : `Audit: ${v.count} entries · cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)`;
  }
  const mode = v.unkeyedRows > 0 ? (v.keyedRows > 0 ? "mixed keyed/unkeyed" : "unkeyed — set CORVIDINHO_AUDIT_HMAC_KEY") : "keyed";
  return `Audit: ${v.count} entries · chain OK (${mode})`;
}

/**
 * Actor/surface for a plugin run, from the bridge-set env only. The actor is
 * the acting Discord user id; on a GitHub (WATCH) run with no Discord actor
 * (REQ-plugins-1203) it is `github:<numeric id>` of the person who triggered
 * it (`CORVIDINHO_ACTING_GITHUB_ID`), else `github:<login>`, else
 * `github:(unknown)` — never `local`, which is the local CLI only. The
 * must-ask gate keys its requester and earlier denials on it too.
 */
export function auditContextFromEnv(env: NodeJS.ProcessEnv = process.env): {
  actor: string;
  surface: string;
} {
  const discord = env.CORVIDINHO_DISCORD_SESSION_ID?.trim();
  const watch = env.CORVIDINHO_WATCH_SESSION_ID?.trim();
  const actor =
    env.CORVIDINHO_ACTING_DISCORD_USER_ID?.trim() || (watch ? githubAuditActor(env) : "local");
  const surface = discord ? `discord:${discord}` : watch ? `watch:${watch}` : "cli";
  return { actor, surface };
}

/** The GitHub trigger of a WATCH run as an audit actor (REQ-plugins-1203). */
function githubAuditActor(env: NodeJS.ProcessEnv): string {
  const id = env.CORVIDINHO_ACTING_GITHUB_ID?.trim() ?? "";
  if (/^[1-9][0-9]{0,19}$/.test(id)) return `github:${id}`;
  const login = env.CORVIDINHO_ACTING_GITHUB_LOGIN?.trim().toLowerCase() ?? "";
  if (/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(login)) return `github:${login}`;
  return "github:(unknown)";
}
