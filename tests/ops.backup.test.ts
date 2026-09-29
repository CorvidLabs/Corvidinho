/**
 * OPS-1 / OPS-2 (#68, REQ-cli-680): nightly SQLite snapshot to a directory the
 * owner sets, rotation, restore of a named snapshot, the weekly restore test
 * and the once-per-failure-streak owner notice. Fixtures only: temp data and
 * backup dirs, injected clocks, no network, no Discord.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BACKUP_KEEP,
  backupDirRefusal,
  type BackupLog,
  type BackupNotify,
  checkDbFile,
  claimBackupNight,
  createBackupTicker,
  formatBackupNotice,
  listSnapshots,
  markBackupRunning,
  pendingBackupNotices,
  processesHolding,
  readBackupStatus,
  resolveBackupConfig,
  restoreSnapshot,
  runRestoreTest,
  snapshotName,
  SNAPSHOT_RE,
  takeSnapshot,
} from "../src/store/backup.ts";
import { readProcStart } from "../src/daemon/lock.ts";
import { AnnounceStore } from "../src/discord/announce-store.ts";
import { backupDoctorCheck } from "../src/doctor.ts";
import { openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";

const dirs: string[] = [];
function tempDir(prefix = "corvidinho-backup-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
const open: Database[] = [];
afterEach(() => {
  for (const db of open.splice(0)) {
    try {
      db.close();
    } catch {
      // closed by the test
    }
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Local time on 2026-09-29 + `day` (the backup is due from 03:00 local). */
const at = (day = 0, hour = 3, minute = 30) => new Date(2026, 8, 29 + day, hour, minute).getTime();

function addMemory(db: Database, id: string, content = "remember this"): void {
  db.run(
    `INSERT INTO memories (id, owner_user_id, category, key, content, created_at, updated_at)
     VALUES (?, 'u1', 'note', ?, ?, 1, 1)`,
    [id, `k-${id}`, content],
  );
}

function liveDb(): { db: Database; path: string; dataDir: string } {
  const dataDir = tempDir("corvidinho-backup-data-");
  const path = join(dataDir, "corvidinho.db");
  const db = openCorvidinhoDb({ path });
  open.push(db);
  addMemory(db, "m1");
  addMemory(db, "m2");
  return { db, path, dataDir };
}

function memoryLog(): { log: BackupLog; lines: Array<{ level: string; event: string; fields: Record<string, unknown> }> } {
  const lines: Array<{ level: string; event: string; fields: Record<string, unknown> }> = [];
  return { lines, log: (level, event, fields = {}) => lines.push({ level, event, fields }) };
}

const events = (lines: Array<{ event: string }>) => lines.map((l) => l.event);

describe("config (OPS-1: a place I choose)", () => {
  test("unset is off (today's behaviour), relative is invalid, absolute is on", () => {
    expect(resolveBackupConfig({})).toEqual({ kind: "off" });
    expect(resolveBackupConfig({ CORVIDINHO_BACKUP_DIR: "  " })).toEqual({ kind: "off" });
    expect(resolveBackupConfig({ CORVIDINHO_BACKUP_DIR: "backups" }).kind).toBe("invalid");
    expect(resolveBackupConfig({ CORVIDINHO_BACKUP_DIR: "/srv/b/../backups" })).toEqual({
      kind: "on",
      dir: "/srv/backups",
    });
  });
});

describe("snapshot (OPS-1)", () => {
  test("is consistent while another connection writes; named by UTC time; 0600 in a 0700 dir; checked", () => {
    const { db, path } = liveDb();
    const writer = new Database(path);
    open.push(writer);
    writer.exec("PRAGMA busy_timeout = 2000;");
    writer.exec("BEGIN IMMEDIATE");
    writer.run(
      `INSERT INTO memories (id, owner_user_id, category, key, content, created_at, updated_at)
       VALUES ('uncommitted', 'u1', 'note', 'k-x', 'not yet', 1, 1)`,
    );
    const dir = join(tempDir(), "nested", "backups");
    const now = Date.UTC(2026, 8, 29, 3, 0, 1);
    const r = takeSnapshot(db, dir, { now });
    writer.exec("COMMIT");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot.name).toBe("corvidinho-20260929T030001Z.db");
    expect(r.snapshot.name).toBe(snapshotName(now));
    expect(SNAPSHOT_RE.test(r.snapshot.name)).toBe(true);
    expect(r.snapshot.takenAt).toBe(now);
    expect(r.schemaVersion).toBe(SCHEMA_VERSION);
    // The uncommitted row is not in the snapshot; the committed ones are.
    expect(r.counts.memories).toBe(2);
    expect(statSync(r.snapshot.path).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    // No temp file is left behind.
    expect(readdirSync(dir)).toEqual([r.snapshot.name]);
    const snap = new Database(r.snapshot.path, { readonly: true });
    open.push(snap);
    const ids = (snap.query("SELECT id FROM memories ORDER BY id").all() as Array<{ id: string }>).map(
      (x) => x.id,
    );
    expect(ids).toEqual(["m1", "m2"]);
    const check = checkDbFile(r.snapshot.path);
    expect(check).toMatchObject({ ok: true, schemaVersion: SCHEMA_VERSION });
  });

  test("carries the DB's SAFE-6 scrubbing: rows are re-scrubbed first when the rules tightened", () => {
    const { db } = liveDb();
    const key = "sk-" + "ant-" + "a1B2c3D4e5F6g7H8i9J0k1L2m3";
    addMemory(db, "leak", `my key is ${key}`);
    // Simulate stored rows from before a rules tightening.
    db.run("UPDATE schema_meta SET value = '0' WHERE key = 'scrub_rules_version'");
    const r = takeSnapshot(db, tempDir(), { now: at() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const snap = new Database(r.snapshot.path, { readonly: true });
    open.push(snap);
    const row = snap.query("SELECT content FROM memories WHERE id = 'leak'").get() as {
      content: string;
    };
    expect(row.content).not.toContain(key);
    expect(row.content).toContain("[redacted:anthropic-key]");
    expect(readFileSync(r.snapshot.path).includes(Buffer.from(key))).toBe(false);
  });

  test(`rotation keeps the newest ${BACKUP_KEEP} snapshots and never touches other files`, () => {
    const { db } = liveDb();
    const dir = tempDir();
    writeFileSync(join(dir, "notes.txt"), "mine");
    writeFileSync(join(dir, "corvidinho-manual.db"), "mine too");
    const names: string[] = [];
    for (let day = 0; day < BACKUP_KEEP + 2; day++) {
      const r = takeSnapshot(db, dir, { now: at(day) });
      expect(r.ok).toBe(true);
      if (r.ok) names.push(r.snapshot.name);
    }
    const kept = listSnapshots(dir).map((s) => s.name);
    expect(kept).toEqual(names.slice(2).reverse());
    expect(existsSync(join(dir, "notes.txt"))).toBe(true);
    expect(existsSync(join(dir, "corvidinho-manual.db"))).toBe(true);
  });

  test("refuses a dir inside a git work tree and a path that is a file, leaving nothing behind", () => {
    const { db } = liveDb();
    const repo = tempDir();
    mkdirSync(join(repo, ".git"));
    const inRepo = takeSnapshot(db, join(repo, "backups"), { now: at() });
    expect(inRepo.ok).toBe(false);
    if (!inRepo.ok) expect(inRepo.error).toContain("inside the git work tree");
    expect(existsSync(join(repo, "backups"))).toBe(false);

    const file = join(tempDir(), "not-a-dir");
    writeFileSync(file, "x");
    const onFile = takeSnapshot(db, file, { now: at() });
    expect(onFile.ok).toBe(false);
    if (!onFile.ok) expect(onFile.error).toContain("is not a directory");
  });

  test("refuses a symlink that points into a git work tree, and a dir not created yet below it", () => {
    const { db } = liveDb();
    const repo = tempDir();
    mkdirSync(join(repo, ".git"));
    mkdirSync(join(repo, "backups"));
    const link = join(tempDir(), "backups-link");
    symlinkSync(join(repo, "backups"), link);
    const r = takeSnapshot(db, link, { now: at() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("inside the git work tree");
    expect(readdirSync(join(repo, "backups"))).toEqual([]);
    expect(backupDirRefusal(join(link, "later"))).toContain("inside the git work tree");
  });

  test("removes a crashed run's leftover temp snapshot, never a recent one or other files", () => {
    const { db } = liveDb();
    const dir = tempDir();
    const stale = join(dir, ".corvidinho-20260920T030000Z.db.tmp");
    const recent = join(dir, ".corvidinho-20260928T030000Z.db.tmp");
    const other = join(dir, ".notes.tmp");
    for (const f of [stale, recent, other]) writeFileSync(f, "private rows");
    const twoHoursAgo = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
    utimesSync(stale, twoHoursAgo, twoHoursAgo);
    utimesSync(other, twoHoursAgo, twoHoursAgo);
    expect(takeSnapshot(db, dir, { now: at() }).ok).toBe(true);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(existsSync(other)).toBe(true);
  });
});

describe("restore (OPS-2)", () => {
  function snapshotOf(db: Database): { dir: string; name: string } {
    const dir = tempDir();
    const r = takeSnapshot(db, dir, { now: at() });
    if (!r.ok) throw new Error(r.error);
    return { dir, name: r.snapshot.name };
  }

  test("restores a named snapshot to a new target, 0600, and checks the restored copy", () => {
    const { db } = liveDb();
    const { dir, name } = snapshotOf(db);
    const target = join(tempDir(), "restored", "corvidinho.db");
    const r = restoreSnapshot({ dir, name, target });
    expect(r).toMatchObject({ ok: true, snapshot: name, target, schemaVersion: SCHEMA_VERSION });
    if (!r.ok) return;
    expect(r.counts.memories).toBe(2);
    expect(statSync(target).mode & 0o777).toBe(0o600);
    const restored = new Database(target, { readonly: true });
    open.push(restored);
    expect(restored.query("SELECT COUNT(*) AS n FROM memories").get()).toEqual({ n: 2 });
  });

  test("never overwrites a DB a process holds open, even with --force", () => {
    const { db, path } = liveDb();
    const { dir, name } = snapshotOf(db);
    addMemory(db, "after-snapshot");
    expect(processesHolding(path)).toContain(process.pid);
    const r = restoreSnapshot({ dir, name, target: path, force: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("is open in process");
      expect(r.error).toContain(String(process.pid));
    }
    // The live DB is untouched.
    expect(db.query("SELECT COUNT(*) AS n FROM memories").get()).toEqual({ n: 3 });
  });

  test("a live daemon.lock next to corvidinho.db counts as a holder", () => {
    const { db, path, dataDir } = liveDb();
    db.close();
    writeFileSync(
      join(dataDir, "daemon.lock"),
      JSON.stringify({ pid: process.pid, startedAt: "", procStart: readProcStart(process.pid) }),
    );
    // This process no longer has the file open; only the lock names it.
    expect(processesHolding(path)).toEqual([process.pid]);
    rmSync(join(dataDir, "daemon.lock"));
    expect(processesHolding(path)).toEqual([]);
  });

  test("an existing target nobody holds needs --force; its stale journal is removed", () => {
    const { db, path } = liveDb();
    const { dir, name } = snapshotOf(db);
    addMemory(db, "after-snapshot");
    db.close();
    const refused = restoreSnapshot({ dir, name, target: path });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("pass --force");
    writeFileSync(`${path}-journal`, "stale journal of the old file");
    const r = restoreSnapshot({ dir, name, target: path, force: true });
    expect(r.ok).toBe(true);
    expect(existsSync(`${path}-journal`)).toBe(false);
    const restored = new Database(path, { readonly: true });
    open.push(restored);
    expect(restored.query("SELECT COUNT(*) AS n FROM memories").get()).toEqual({ n: 2 });
  });

  test("refuses a name that is not a snapshot, a missing one, a corrupt one and a directory target", () => {
    const { db } = liveDb();
    const { dir, name } = snapshotOf(db);
    const target = join(tempDir(), "t.db");
    const traversal = restoreSnapshot({ dir, name: "../corvidinho.db", target });
    expect(traversal.ok).toBe(false);
    if (!traversal.ok) expect(traversal.error).toContain("not a snapshot name");
    const missing = restoreSnapshot({ dir, name: "corvidinho-20000101T000000Z.db", target });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("no snapshot");
    writeFileSync(join(dir, "corvidinho-20000102T000000Z.db"), "not sqlite at all, just text".repeat(200));
    const corrupt = restoreSnapshot({ dir, name: "corvidinho-20000102T000000Z.db", target });
    expect(corrupt.ok).toBe(false);
    if (!corrupt.ok) expect(corrupt.error).toContain("is not usable");
    expect(existsSync(target)).toBe(false);
    const asDir = restoreSnapshot({ dir, name, target: tempDir() });
    expect(asDir.ok).toBe(false);
    if (!asDir.ok) expect(asDir.error).toContain("is a directory");
  });
});

describe("restore test (OPS-2)", () => {
  test("restores the newest snapshot into a temp dir, checks it, and deletes it", () => {
    const { db } = liveDb();
    const dir = tempDir();
    takeSnapshot(db, dir, { now: at(0) });
    addMemory(db, "m3");
    const newest = takeSnapshot(db, dir, { now: at(1) });
    if (!newest.ok) throw new Error(newest.error);
    const tmpRoot = tempDir();
    const r = runRestoreTest(dir, {
      tmpRoot,
      expected: { snapshot: newest.snapshot.name, counts: newest.counts },
    });
    expect(r).toMatchObject({ ok: true, snapshot: newest.snapshot.name, schemaVersion: SCHEMA_VERSION });
    if (r.ok) expect(r.counts.memories).toBe(3);
    expect(readdirSync(tmpRoot)).toEqual([]);
  });

  test("fails on a corrupt newest snapshot, on row counts that differ, and with no snapshot", () => {
    const { db } = liveDb();
    const dir = tempDir();
    const good = takeSnapshot(db, dir, { now: at(0) });
    if (!good.ok) throw new Error(good.error);
    const tmpRoot = tempDir();
    const differ = runRestoreTest(dir, {
      tmpRoot,
      expected: { snapshot: good.snapshot.name, counts: { ...good.counts, memories: 5 } },
    });
    expect(differ.ok).toBe(false);
    if (!differ.ok) expect(differ.error).toContain("row counts differ after restore: memories 2 (backed up 5)");

    const bytes = readFileSync(good.snapshot.path);
    bytes.fill(0x41, 100, Math.min(bytes.length, 6000));
    writeFileSync(join(dir, "corvidinho-20990101T000000Z.db"), bytes);
    const corrupt = runRestoreTest(dir, { tmpRoot });
    expect(corrupt.ok).toBe(false);
    if (!corrupt.ok) expect(corrupt.snapshot).toBe("corvidinho-20990101T000000Z.db");
    expect(readdirSync(tmpRoot)).toEqual([]);

    const none = runRestoreTest(tempDir(), { tmpRoot });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error).toContain("no snapshot");
  });
});

describe("nightly ticker (OPS-1/2)", () => {
  test("off when CORVIDINHO_BACKUP_DIR is unset: nothing claimed, nothing written, nothing logged", () => {
    const { db } = liveDb();
    const { log, lines } = memoryLog();
    const ticker = createBackupTicker({ db, env: {}, log });
    ticker.tick(at());
    expect(lines).toEqual([]);
    expect(readBackupStatus(db).night).toBeNull();
  });

  test("runs once per night from 03:00 local across two tickers on one data dir; restore test weekly", () => {
    const { db, path } = liveDb();
    const dir = tempDir();
    const env = { CORVIDINHO_BACKUP_DIR: dir };
    const a = memoryLog();
    const b = memoryLog();
    const other = new Database(path);
    open.push(other);
    other.exec("PRAGMA busy_timeout = 5000;");
    const bridge = createBackupTicker({ db, env, log: a.log, tmpRoot: tempDir() });
    const daemon = createBackupTicker({ db: other, env, log: b.log, tmpRoot: tempDir() });

    bridge.tick(at(0, 2, 59));
    expect(listSnapshots(dir)).toEqual([]);
    bridge.tick(at(0, 3, 0));
    daemon.tick(at(0, 3, 1));
    bridge.tick(at(0, 23, 59));
    expect(listSnapshots(dir)).toHaveLength(1);
    expect(events(a.lines)).toEqual(["backup.ok", "restore_test.ok"]);
    expect(b.lines).toEqual([]);
    const ok = a.lines[0]!.fields;
    expect(ok.dir).toBe(dir);
    expect((ok.counts as Record<string, number>).memories).toBe(2);

    // Next night: a new snapshot, no restore test (weekly).
    daemon.tick(at(1, 4, 0));
    expect(listSnapshots(dir)).toHaveLength(2);
    expect(events(b.lines)).toEqual(["backup.ok"]);
    // A week after the last test: tested again.
    for (let day = 2; day <= 7; day++) daemon.tick(at(day));
    expect(events(b.lines).filter((e) => e === "restore_test.ok")).toHaveLength(1);
    const status = readBackupStatus(db);
    expect(status.backup.failingSince).toBeNull();
    expect(status.restoreTest.lastOkAt).toBe(at(7));
  });

  test("a failed backup is logged and tells the owner once per failure streak, with fixed text", async () => {
    const { db } = liveDb();
    const file = join(tempDir(), "not-a-dir");
    writeFileSync(file, "x");
    const env: Record<string, string> = { CORVIDINHO_BACKUP_DIR: file };
    const told: Array<{ job: string; content: string }> = [];
    const notify: BackupNotify = async (n) => {
      told.push({ job: n.job, content: n.content });
      return true;
    };
    const { log, lines } = memoryLog();
    const ticker = createBackupTicker({ db, env, log, notify, tmpRoot: tempDir() });

    ticker.tick(at(0));
    await ticker.settle();
    expect(events(lines)).toEqual(["backup.failed", "restore_test.skipped", "backup.owner_told"]);
    expect(lines[0]!.level).toBe("error");
    expect(lines[0]!.fields.error).toContain("is not a directory");
    expect(lines[0]!.fields.ownerNotice).toBe("recorded");
    expect(told).toHaveLength(1);
    expect(told[0]!.job).toBe("backup");
    expect(told[0]!.content).toContain("The nightly backup failed");
    expect(told[0]!.content).toContain("corvidinho doctor");
    // Never a host path or the error text in the post.
    expect(told[0]!.content).not.toContain(file);
    expect(told[0]!.content).not.toContain("not a directory");

    // Same streak: logged again, not told again.
    ticker.tick(at(1));
    await ticker.settle();
    expect(told).toHaveLength(1);
    expect(lines.filter((l) => l.event === "backup.failed").at(-1)!.fields.ownerNotice).toBe(
      "already recorded this failure streak",
    );
    expect(readBackupStatus(db).backup.failingSince).toBe(at(0));

    // Fixed: the streak ends.
    const dir = tempDir();
    env.CORVIDINHO_BACKUP_DIR = dir;
    ticker.tick(at(2));
    await ticker.settle();
    const recovered = lines.find((l) => l.event === "backup.ok");
    expect(recovered?.fields.recovered).toBe(true);
    expect(readBackupStatus(db).backup.failingSince).toBeNull();

    // Broken again: a new streak tells the owner again.
    env.CORVIDINHO_BACKUP_DIR = file;
    ticker.tick(at(3));
    await ticker.settle();
    expect(told).toHaveLength(2);
  });

  test("the notice waits for a ticker that can post and is handed back when the post does not go out", async () => {
    const { db, path } = liveDb();
    const env = { CORVIDINHO_BACKUP_DIR: "relative/dir" };
    const daemonLog = memoryLog();
    // The daemon has no Discord: it records the notice and logs the failure.
    createBackupTicker({ db, env, log: daemonLog.log }).tick(at(0));
    expect(events(daemonLog.lines)).toEqual(["backup.failed"]);
    expect(daemonLog.lines[0]!.fields.error).toContain("must be an absolute path");
    expect(pendingBackupNotices(db)).toEqual([{ job: "backup", at: at(0) }]);

    const other = new Database(path);
    open.push(other);
    let accept = false;
    const posts: string[] = [];
    const bridgeLog = memoryLog();
    const bridge = createBackupTicker({
      db: other,
      env,
      log: bridgeLog.log,
      notify: async (n) => {
        posts.push(n.content);
        return accept;
      },
    });
    // Already claimed tonight by the daemon: the bridge only delivers.
    bridge.tick(at(0, 5));
    await bridge.settle();
    bridge.tick(at(0, 6));
    await bridge.settle();
    expect(posts).toHaveLength(2);
    expect(pendingBackupNotices(other)).toHaveLength(1);
    expect(events(bridgeLog.lines)).toEqual(["backup.owner_not_told"]);

    accept = true;
    bridge.tick(at(0, 7));
    await bridge.settle();
    expect(pendingBackupNotices(other)).toEqual([]);
    expect(events(bridgeLog.lines)).toEqual(["backup.owner_not_told", "backup.owner_told"]);
    bridge.tick(at(0, 8));
    await bridge.settle();
    expect(posts).toHaveLength(3);
    expect(readBackupStatus(other).backup.noticePending).toBe(false);
  });

  test("a failed restore test is logged and tells the owner once", async () => {
    const { db } = liveDb();
    const dir = tempDir();
    const badTmpRoot = join(tempDir(), "file-not-dir");
    writeFileSync(badTmpRoot, "x");
    const told: string[] = [];
    const { log, lines } = memoryLog();
    const ticker = createBackupTicker({
      db,
      env: { CORVIDINHO_BACKUP_DIR: dir },
      log,
      tmpRoot: badTmpRoot,
      notify: async (n) => {
        told.push(n.content);
        return true;
      },
    });
    ticker.tick(at(0));
    await ticker.settle();
    ticker.tick(at(1));
    await ticker.settle();
    expect(events(lines)).toEqual([
      "backup.ok",
      "restore_test.failed",
      "restore_test.owner_told",
      "backup.ok",
      // A failing test is retried the next night (not only weekly), told once.
      "restore_test.failed",
    ]);
    expect(told).toEqual([formatBackupNotice({ job: "restore_test", at: at(0) })]);
    expect(told[0]).toContain("The restore test failed");
    const status = readBackupStatus(db);
    expect(status.restoreTest.failingSince).toBe(at(0));
    expect(status.restoreTest.lastError).toBeTruthy();
  });

  test("a run a dead process left unfinished is recorded as a failure and told once; a live one is left alone", async () => {
    const { db } = liveDb();
    const env = { CORVIDINHO_BACKUP_DIR: tempDir() };
    const { log, lines } = memoryLog();
    const told: string[] = [];
    const ticker = createBackupTicker({
      db,
      env,
      log,
      notify: async (n) => {
        told.push(n.content);
        return true;
      },
      tmpRoot: tempDir(),
    });
    const running = () =>
      (db.query("SELECT value FROM schema_meta WHERE key = 'ops_backup_running'").get() as {
        value: string;
      } | null)?.value ?? null;

    // Still running in a live process (this one): not a failure.
    markBackupRunning(db, "backup", at(0));
    ticker.tick(at(0, 2)); // before 03:00: nothing to claim tonight
    await ticker.settle();
    expect(lines).toEqual([]);
    expect(running()).not.toBeNull();

    // Its process is gone (the pid now belongs to a process started later).
    db.run("UPDATE schema_meta SET value = ? WHERE key = 'ops_backup_running'", [
      JSON.stringify({ job: "restore_test", at: at(0), pid: process.pid, procStart: "an-earlier-process" }),
    ]);
    ticker.tick(at(0, 2, 10));
    await ticker.settle();
    expect(events(lines)).toEqual(["restore_test.failed", "restore_test.owner_told"]);
    expect(lines[0]!.level).toBe("error");
    expect(lines[0]!.fields.interrupted).toBe(true);
    expect(String(lines[0]!.fields.error)).toContain("interrupted: the process stopped during the restore test");
    expect(told).toHaveLength(1);
    expect(told[0]).toContain("The restore test failed");
    expect(readBackupStatus(db).restoreTest.failingSince).toBe(at(0, 2, 10));
    expect(running()).toBeNull();

    // Taken once; tonight's run then clears its own marker and ends the streak.
    ticker.tick(at(0, 2, 20));
    await ticker.settle();
    expect(lines).toHaveLength(2);
    ticker.tick(at(0));
    await ticker.settle();
    expect(events(lines).slice(2)).toEqual(["backup.ok", "restore_test.ok"]);
    expect(lines[3]!.fields.recovered).toBe(true);
    expect(running()).toBeNull();
  });

  test("shutdown: a notice whose post outlasts the grace is handed back, never lost", async () => {
    const { db } = liveDb();
    let finish: (sent: boolean) => void = () => {};
    const posts: string[] = [];
    const ticker = createBackupTicker({
      db,
      env: { CORVIDINHO_BACKUP_DIR: "relative/dir" },
      log: () => {},
      notify: (n) => {
        posts.push(n.content);
        return new Promise<boolean>((done) => {
          finish = done;
        });
      },
    });
    ticker.tick(at(0));
    expect(posts).toHaveLength(1);
    expect(pendingBackupNotices(db)).toEqual([]); // taken; its post is in flight
    ticker.stop();
    expect(await ticker.settle(20)).toBe(false);
    // Handed back: the next start posts it.
    expect(pendingBackupNotices(db)).toEqual([{ job: "backup", at: at(0) }]);
    // Stopped: a late tick takes nothing and runs nothing.
    ticker.tick(at(1));
    expect(posts).toHaveLength(1);
    expect(readBackupStatus(db).night).toBe("2026-09-29");
    // The post did go out after all: taken again, so it is not repeated.
    finish(true);
    expect(await ticker.settle()).toBe(true);
    expect(pendingBackupNotices(db)).toEqual([]);
  });

  test("the night claim is per local day and per data dir", () => {
    const { db } = liveDb();
    expect(claimBackupNight(db, at(0, 1))).toBe(false);
    expect(claimBackupNight(db, at(0, 3))).toBe(true);
    expect(claimBackupNight(db, at(0, 22))).toBe(false);
    expect(claimBackupNight(db, at(1, 0, 30))).toBe(false);
    expect(claimBackupNight(db, at(1, 3))).toBe(true);
  });
});

describe("doctor (OPS-1: no backup when unset, doctor says so)", () => {
  test("off, a relative path and a dir in a git repo are warnings that never fail doctor", () => {
    expect(backupDoctorCheck({})).toMatchObject({ name: "backup", ok: true, mark: "warn" });
    expect(backupDoctorCheck({}).detail).toContain("CORVIDINHO_BACKUP_DIR is not set, so there is no nightly backup");
    const rel = backupDoctorCheck({ CORVIDINHO_BACKUP_DIR: "backups" });
    expect(rel).toMatchObject({ ok: true, mark: "warn" });
    expect(rel.detail).toContain("must be an absolute path");
    const repo = tempDir();
    mkdirSync(join(repo, ".git"));
    const inRepo = backupDoctorCheck({ CORVIDINHO_BACKUP_DIR: join(repo, "b") });
    expect(inRepo).toMatchObject({ ok: true, mark: "warn" });
    expect(inRepo.detail).toContain("inside the git work tree");
  });

  test("reads the backup history read-only: with no data dir DB yet it creates neither", () => {
    const dataDir = join(tempDir(), "data-not-yet");
    const dir = tempDir();
    const r = backupDoctorCheck({ CORVIDINHO_DATA_DIR: dataDir, CORVIDINHO_BACKUP_DIR: dir });
    expect(r).toMatchObject({ name: "backup", ok: true });
    expect(r.mark).toBeUndefined();
    expect(r.detail).toContain("no backup yet (no corvidinho.db in the data dir yet)");
    expect(existsSync(dataDir)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });

  test("a dir not created yet is ok; the last backup and restore test are shown; a failing one warns with its reason", async () => {
    const { db } = liveDb();
    const dir = join(tempDir(), "later");
    const env = { CORVIDINHO_BACKUP_DIR: dir };
    // OPS-1 "I'm told": the notice only goes to the /announce channel, so
    // doctor warns until one is set (and still never fails).
    const unannounced = backupDoctorCheck(env, { db });
    expect(unannounced).toMatchObject({ ok: true, mark: "warn" });
    expect(unannounced.detail).toContain(
      "no /announce channel set, so a failed backup or restore test is not posted to the owner",
    );
    new AnnounceStore(db).setChannelId("announce-1");
    const fresh = backupDoctorCheck(env, { db });
    expect(fresh).toMatchObject({ ok: true });
    expect(fresh.mark).toBeUndefined();
    expect(fresh.detail).not.toContain("/announce");
    expect(fresh.detail).toContain(`${dir} (created on the first backup)`);
    expect(fresh.detail).toContain("0 snapshot(s)");
    expect(fresh.detail).toContain("no backup yet");
    expect(existsSync(dir)).toBe(false);

    createBackupTicker({ db, env, log: () => {}, tmpRoot: tempDir() }).tick(at(0));
    const good = backupDoctorCheck(env, { db });
    expect(good.ok).toBe(true);
    expect(good.detail).toContain("1 snapshot(s), newest corvidinho-");
    expect(good.detail).toContain("last backup ok 2026-09-");
    expect(good.detail).toContain("restore test ok 2026-09-");

    const file = join(tempDir(), "not-a-dir");
    writeFileSync(file, "x");
    const broken = { CORVIDINHO_BACKUP_DIR: file };
    createBackupTicker({ db, env: broken, log: () => {} }).tick(at(1));
    const failing = backupDoctorCheck({ CORVIDINHO_BACKUP_DIR: dir }, { db });
    expect(failing).toMatchObject({ ok: true, mark: "warn" });
    expect(failing.detail).toContain("last backup FAILED (failing since");
    expect(failing.detail).toContain("is not a directory");
    expect(failing.detail).toContain("owner not told yet");
    const told = createBackupTicker({ db, env: broken, log: () => {}, notify: async () => true });
    told.tick(at(1, 5));
    await told.settle();
    expect(backupDoctorCheck({ CORVIDINHO_BACKUP_DIR: dir }, { db }).detail).toContain("; owner told");
  });
});
