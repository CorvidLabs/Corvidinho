/**
 * Shared-DB writers take the write lock up front (BEGIN IMMEDIATE) so
 * `busy_timeout` applies when another process is writing (REQ-plugins-287,
 * REQ-discord-287; SAFE-5 complete audit trail, SAFE-6 re-scrub).
 *
 * A deferred BEGIN + SELECT + write that meets another writer's RESERVED lock
 * gets SQLITE_BUSY without the busy handler ("database is locked" at once), so
 * the SAFE-5 row was lost. A child process holds the write lock for a moment
 * and then commits; the parent's write must wait for it and succeed. Several
 * processes appending at once (as concurrent plugin runs do) lose no rows.
 *
 * SQLite's own busy handler backs off to one try every 100 ms, while writers
 * that commit back to back free the file for well under a millisecond, so a
 * waiting open or append could be passed over for the whole busy_timeout (on
 * a slow disk the concurrent appenders lost a row). The open and the append
 * now try every millisecond (retryWhileBusy); a lock freed only briefly
 * after a long wait must be taken.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAudit, argsDigest, verifyAudit } from "../src/audit/index.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { rescrubDatabase } from "../src/store/scrub.ts";

const LOG_TS = join(import.meta.dir, "..", "src", "audit", "log.ts");
const DB_TS = join(import.meta.dir, "..", "src", "store", "db.ts");
const HOLD_MS = 750;
const APPENDERS = 4;
const APPENDS_EACH = 40;

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

// Child: like HOLDER (BEGIN <LOCK>: IMMEDIATE keeps other writers out,
// EXCLUSIVE keeps readers out too), but after it commits it leaves the lock
// free for only FREE_MS, then takes it again and keeps it until the parent
// creates DONE_FILE or LOCK_UNTIL_MS after it first locked.
const BRIEF_RELEASER = `
import { Database } from "bun:sqlite";
import { existsSync, writeSync } from "node:fs";
import { appendAudit } from ${JSON.stringify(LOG_TS)};
const db = new Database(process.env.HOLD_DB);
db.exec("PRAGMA busy_timeout = 5000;");
const begin = "BEGIN " + process.env.LOCK;
db.exec(begin);
const lockedAt = Date.now();
appendAudit(db, { action: "holder", actor: "u-child", surface: "cli", argsDigest: "0".repeat(64), outcome: "started" });
writeSync(1, "locked\\n");
Bun.sleepSync(Number(process.env.HOLD_MS));
db.exec("COMMIT");
Bun.sleepSync(Number(process.env.FREE_MS));
db.exec(begin);
while (!existsSync(process.env.DONE_FILE) && Date.now() - lockedAt < Number(process.env.LOCK_UNTIL_MS)) {
  Bun.sleepSync(5);
}
db.exec("COMMIT");
db.close();
`;

// SQLite's own busy handler (busy_timeout) backs off to one try every 100 ms
// once it has waited 228 ms (tries at ~928 ms, ~1028 ms, ...): a lock that is
// free only from 970 to 1020 ms after the child took it falls between two
// tries, and the child then keeps it past the waiter's 5 s busy_timeout.
const BRIEF_RELEASE_ENV = { HOLD_MS: "970", FREE_MS: "50", LOCK_UNTIL_MS: "6500" };

// Child: like a dangerous plugin run's audit write (src/plugins/run.ts), open
// the shared file DB, append one row and close it, APPENDS_EACH times. All
// children start at START_AT so their appends overlap.
const APPENDER = `
import { appendAudit } from ${JSON.stringify(LOG_TS)};
import { openCorvidinhoDb } from ${JSON.stringify(DB_TS)};
const wait = Number(process.env.START_AT) - Date.now();
if (wait > 0) Bun.sleepSync(wait);
let ok = 0;
const errors = [];
for (let i = 0; i < Number(process.env.APPENDS_EACH); i++) {
  let db;
  try {
    db = openCorvidinhoDb({ path: process.env.HOLD_DB });
    appendAudit(db, { action: "shell-exec", actor: "u-" + process.pid, surface: "cli", argsDigest: "0".repeat(64), outcome: "ok", exitCode: 0 });
    ok += 1;
  } catch (err) {
    errors.push(String(err));
  } finally {
    db?.close();
  }
}
console.log(JSON.stringify({ ok, errors: errors.slice(0, 3) }));
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
async function holdWriteLock(
  path: string,
  script = HOLDER,
  env: Record<string, string> = { HOLD_MS: String(HOLD_MS) },
): Promise<{ exited: Promise<number> }> {
  const proc = Bun.spawn(["bun", "-e", script], {
    env: { ...process.env, HOLD_DB: path, ...env },
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
    // A child `bun` process holds the lock: on a slow runner its start-up alone
    // can pass bun:test's 5 s default, so give it the same room as below.
  }, 30_000);

  test("appendAudit takes the write lock when another process frees it only briefly, after a long wait (SAFE-5)", async () => {
    // SQLite's back-off missed the brief release (BRIEF_RELEASE_ENV) and the
    // SAFE-5 row was lost. Writers that commit back to back free the lock for
    // well under a millisecond, so concurrent appenders lost rows the same way.
    const path = tempDbPath();
    const done = `${path}.done`;
    const db = openCorvidinhoDb({ path });
    try {
      const holder = await holdWriteLock(path, BRIEF_RELEASER, {
        ...BRIEF_RELEASE_ENV,
        LOCK: "IMMEDIATE",
        DONE_FILE: done,
      });
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
      writeFileSync(done, "");
      expect(await holder.exited).toBe(0);
      expect(error).toBeUndefined();
      expect(res?.seq).toBe(2);
      const rows = db
        .query("SELECT seq, action, prev_hash, hash FROM audit_log ORDER BY seq")
        .all() as Array<{ seq: number; action: string; prev_hash: string; hash: string }>;
      expect(rows.map((r) => r.action)).toEqual(["holder", "memory-forget"]);
      expect(rows[1]!.prev_hash).toBe(rows[0]!.hash);
      expect(verifyAudit(db)).toMatchObject({ ok: true, count: 2 });
      // The connection keeps its busy_timeout for later statements.
      expect(db.query("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
    } finally {
      db.close();
    }
  }, 30_000);

  test("openCorvidinhoDb gets in when another process frees the file only briefly, after a long wait (SAFE-5)", async () => {
    // A plugin run opens the shared DB before its SAFE-5 append
    // (src/plugins/run.ts). A committing writer keeps readers out too, so the
    // open's reads waited under the same back-off: the open failed and the
    // row was lost. It now waits once, for all its statements, and retries
    // every millisecond.
    const path = tempDbPath();
    const done = `${path}.done`;
    openCorvidinhoDb({ path }).close();
    const holder = await holdWriteLock(path, BRIEF_RELEASER, {
      ...BRIEF_RELEASE_ENV,
      LOCK: "EXCLUSIVE",
      DONE_FILE: done,
    });
    let db: ReturnType<typeof openCorvidinhoDb> | undefined;
    let error: unknown;
    try {
      db = openCorvidinhoDb({ path });
    } catch (err) {
      error = err;
    }
    writeFileSync(done, "");
    try {
      expect(await holder.exited).toBe(0);
      expect(error).toBeUndefined();
      const res = appendAudit(db!, {
        action: "shell-exec",
        actor: "u-parent",
        surface: "cli",
        argsDigest: argsDigest(["ls"]),
        outcome: "started",
      });
      expect(res.seq).toBe(2);
      expect(verifyAudit(db!)).toMatchObject({ ok: true, count: 2 });
      expect(db!.query("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
      expect(db!.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    } finally {
      db?.close();
    }
  }, 30_000);

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
  }, 30_000);

  test(
    "concurrent appenders in several processes lose no rows and keep one chain (SAFE-5)",
    async () => {
      const path = tempDbPath();
      openCorvidinhoDb({ path }).close();
      const startAt = Date.now() + 400;
      const procs = Array.from({ length: APPENDERS }, () =>
        Bun.spawn(["bun", "-e", APPENDER], {
          env: {
            ...process.env,
            HOLD_DB: path,
            APPENDS_EACH: String(APPENDS_EACH),
            START_AT: String(startAt),
          },
          stdout: "pipe",
          stderr: "pipe",
        }),
      );
      const results = await Promise.all(
        procs.map(async (p) => {
          const [out, err, code] = await Promise.all([
            new Response(p.stdout).text(),
            new Response(p.stderr).text(),
            p.exited,
          ]);
          if (code !== 0) throw new Error(`appender exited ${code}: ${err}`);
          return JSON.parse(out) as { ok: number; errors: string[] };
        }),
      );
      for (const r of results) expect(r).toEqual({ ok: APPENDS_EACH, errors: [] });
      const db = openCorvidinhoDb({ path });
      try {
        expect(verifyAudit(db)).toMatchObject({ ok: true, count: APPENDERS * APPENDS_EACH });
      } finally {
        db.close();
      }
    },
    30_000,
  );
});
