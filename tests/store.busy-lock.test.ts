/**
 * Shared-DB writers take the write lock up front (BEGIN IMMEDIATE) so
 * `busy_timeout` applies when another process is writing (REQ-plugins-287,
 * REQ-discord-287; SAFE-5 complete audit trail, SAFE-6 re-scrub).
 *
 * A deferred BEGIN + SELECT + write that meets another writer's RESERVED lock
 * gets SQLITE_BUSY without the busy handler ("database is locked" at once), so
 * the SAFE-5 row was lost. A child process holds the write lock for a moment
 * and then commits; the parent's write must wait for it and succeed.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAudit, argsDigest, verifyAudit } from "../src/audit/index.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { rescrubDatabase } from "../src/store/scrub.ts";

const LOG_TS = join(import.meta.dir, "..", "src", "audit", "log.ts");
const HOLD_MS = 750;

// Child: open the same file, take the write lock, append one audit row inside
// it, report "locked", hold the lock, then commit.
const HOLDER = `
import { Database } from "bun:sqlite";
import { writeSync } from "node:fs";
import { appendAudit } from ${JSON.stringify(LOG_TS)};
const db = new Database(process.env.HOLD_DB);
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("BEGIN IMMEDIATE");
appendAudit(db, { action: "holder", actor: "u-child", surface: "cli", argsDigest: "0".repeat(64), outcome: "started" });
writeSync(1, "locked\\n");
Bun.sleepSync(Number(process.env.HOLD_MS));
db.exec("COMMIT");
db.close();
`;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-busy-lock-"));
  dirs.push(dir);
  return join(dir, "corvidinho.sqlite");
}

/** Start the lock holder and resolve once it holds the write lock. */
async function holdWriteLock(path: string): Promise<{ exited: Promise<number> }> {
  const proc = Bun.spawn(["bun", "-e", HOLDER], {
    env: { ...process.env, HOLD_DB: path, HOLD_MS: String(HOLD_MS) },
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (!out.includes("locked")) {
    const { value, done } = await reader.read();
    if (done) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`lock holder exited early: ${out}${err}`);
    }
    out += decoder.decode(value);
  }
  reader.releaseLock();
  return { exited: proc.exited };
}

describe("shared DB writers wait for another process's write lock", () => {
  test("appendAudit waits under busy_timeout and links after the other writer's row (SAFE-5)", async () => {
    const path = tempDbPath();
    const db = openCorvidinhoDb({ path });
    try {
      const holder = await holdWriteLock(path);
      let res: { seq: number; hash: string } | undefined;
      let error: unknown;
      try {
        res = appendAudit(db, {
          action: "memory-forget",
          actor: "u-parent",
          surface: "discord:s1",
          argsDigest: argsDigest(["--id", "x"]),
          outcome: "ok",
          exitCode: 0,
        });
      } catch (err) {
        error = err;
      }
      expect(await holder.exited).toBe(0);
      expect(error).toBeUndefined();
      expect(res?.seq).toBe(2);
      const rows = db
        .query("SELECT seq, action, prev_hash, hash FROM audit_log ORDER BY seq")
        .all() as Array<{ seq: number; action: string; prev_hash: string; hash: string }>;
      expect(rows.map((r) => r.action)).toEqual(["holder", "memory-forget"]);
      expect(rows[1]!.prev_hash).toBe(rows[0]!.hash);
      expect(verifyAudit(db)).toMatchObject({ ok: true, count: 2 });
    } finally {
      db.close();
    }
  });

  test("rescrubDatabase waits under busy_timeout instead of failing at once (SAFE-6)", async () => {
    const path = tempDbPath();
    const db = openCorvidinhoDb({ path });
    try {
      // A row written before the current scrub rules (raw, bypassing the store).
      const secret = "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);
      db.run(
        `INSERT INTO discord_sessions (id, channel_id, user_id, topic, created_at, last_activity_at)
         VALUES ('s1', 'c1', 'u1', ?, 1, 1)`,
        [`deploy with ${secret}`],
      );
      const holder = await holdWriteLock(path);
      let res: { rowsUpdated: number } | undefined;
      let error: unknown;
      try {
        res = rescrubDatabase(db);
      } catch (err) {
        error = err;
      }
      expect(await holder.exited).toBe(0);
      expect(error).toBeUndefined();
      expect(res?.rowsUpdated).toBe(1);
      const row = db.query("SELECT topic FROM discord_sessions WHERE id = 's1'").get() as {
        topic: string;
      };
      expect(row.topic).not.toContain(secret);
      expect(row.topic).toContain("[redacted:");
      expect(verifyAudit(db)).toMatchObject({ ok: true, count: 1 });
    } finally {
      db.close();
    }
  });
});
