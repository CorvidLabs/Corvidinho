/**
 * OPS-1 / OPS-2 (#68) — nightly backup of the shared SQLite DB to a local
 * directory the owner sets, a weekly restore test, and a restore command.
 *
 *  - Place: `CORVIDINHO_BACKUP_DIR` (absolute path, optional). Unset ⇒ no
 *    backup (today's behaviour); `corvidinho doctor` says so. A directory
 *    inside a git work tree is refused: snapshots hold private notes and
 *    must never be committed (SAFE-6).
 *  - Snapshot: `VACUUM INTO` on the live connection, SQLite's online,
 *    read-transaction-consistent copy (safe while the bridge, daemon and
 *    spawned agents write). Written to a temp name with umask 077, checked
 *    (integrity, schema version, row counts), fsynced, then renamed to
 *    `corvidinho-<UTC stamp>.db` (mode 0600). Rows are copied as stored, so
 *    the snapshot carries the DB's SAFE-6 scrubbing (re-scrubbed first when
 *    the rules tightened). The newest BACKUP_KEEP snapshots are kept.
 *  - When: from the scheduler tick (bridge and daemon), at the first tick at
 *    or after BACKUP_HOUR local time, once per night per data dir: the night
 *    is claimed in an IMMEDIATE transaction on `schema_meta`, so a bridge
 *    and a daemon on one data dir back up once.
 *  - Restore test (OPS-2): in the same night slot, when none ran for
 *    RESTORE_TEST_INTERVAL_MS (or the last one failed) and the directory
 *    holds a snapshot (none yet ⇒ skipped and logged), the newest snapshot
 *    is restored with the same code as `corvidinho backup restore` into a
 *    temp dir, opened, checked (integrity_check, schema version, the current
 *    schema's tables, row counts equal to those recorded when that snapshot
 *    was taken) and deleted.
 *  - Told: every run is logged (daemon JSON line / bridge console line,
 *    scrubbed). The first failure of a streak records an owner notice in
 *    `schema_meta`; a ticker that can post (the bridge) claims it and posts
 *    fixed text (never a host path or error text) with the owner pinged, and
 *    hands it back when the post does not go out. Later failures of the same
 *    streak are logged only; a success ends the streak.
 *  - Restore: a named snapshot (from `backup list`) is checked, copied to a
 *    temp file next to the target, fsynced and renamed over it. A target a
 *    process holds open (Linux /proc fd scan; for `corvidinho.db` also a
 *    live `daemon.lock`) is refused even with --force; any other existing
 *    target needs --force.
 *
 * State lives in `schema_meta` keys (no new table, no schema version bump),
 * like the announce channel and the memory confirm secret.
 */

import { Database } from "bun:sqlite";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { isHolderAlive, daemonLockPath } from "../daemon/lock.ts";
import { migrateCorvidinhoDb, SCHEMA_VERSION } from "./db.ts";
import { ensureScrubbed, formatErrorLine, scrubSecrets } from "./scrub.ts";

/** Env var naming the local backup directory (absolute path). */
export const BACKUP_DIR_ENV = "CORVIDINHO_BACKUP_DIR";
/** Snapshots kept; older ones are deleted after a successful backup. */
export const BACKUP_KEEP = 7;
/** Local hour from which the nightly backup is due. */
export const BACKUP_HOUR = 3;
/** Restore test cadence (weekly); a failed test is retried each night. */
export const RESTORE_TEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** `corvidinho-20260929T030001Z.db` — only these files are listed or rotated. */
export const SNAPSHOT_RE = /^corvidinho-(\d{8})T(\d{6})Z\.db$/;
/** The live DB file name in a data dir (src/store/paths.ts). */
const LIVE_DB_NAME = "corvidinho.db";
const ERROR_MAX = 300;

export type BackupConfig =
  | { kind: "off" }
  | { kind: "invalid"; error: string }
  | { kind: "on"; dir: string };

/** `CORVIDINHO_BACKUP_DIR`: unset ⇒ off; relative ⇒ invalid; else on. */
export function resolveBackupConfig(env: NodeJS.ProcessEnv = process.env): BackupConfig {
  const raw = env[BACKUP_DIR_ENV]?.trim();
  if (!raw) return { kind: "off" };
  if (!isAbsolute(raw)) {
    return { kind: "invalid", error: `${BACKUP_DIR_ENV} must be an absolute path` };
  }
  return { kind: "on", dir: resolve(raw) };
}

/** Nearest directory at or above `dir` that holds `.git`, or null. */
export function gitWorkTreeAbove(dir: string): string | null {
  for (let cur = resolve(dir); ; ) {
    if (existsSync(join(cur, ".git"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

/** Why `dir` cannot hold backups, or null when it can (it may not exist yet). */
export function backupDirRefusal(dir: string): string | null {
  const repo = gitWorkTreeAbove(dir);
  if (repo) {
    return `backup dir ${dir} is inside the git work tree ${repo} — snapshots hold private notes and must never be committed; choose a directory outside any repo`;
  }
  try {
    if (!statSync(dir).isDirectory()) return `backup dir ${dir} is not a directory`;
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code !== "ENOENT") return `backup dir ${dir} cannot be read (${String(code ?? "error")})`;
  }
  return null;
}

export type SnapshotInfo = {
  name: string;
  path: string;
  /** Epoch ms parsed from the name (UTC). */
  takenAt: number;
  bytes: number;
};

/** Snapshot file name for `now` (UTC stamp, sorts by time). */
export function snapshotName(now: number): string {
  const stamp = new Date(now).toISOString().slice(0, 19).replace(/[-:]/g, "");
  return `corvidinho-${stamp}Z.db`;
}

function stampToMs(date: string, time: string): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8)),
    Number(time.slice(0, 2)),
    Number(time.slice(2, 4)),
    Number(time.slice(4, 6)),
  );
}

/** Snapshots in `dir`, newest first. A missing dir lists nothing. */
export function listSnapshots(dir: string): SnapshotInfo[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    if ((err as { code?: unknown }).code === "ENOENT") return [];
    throw err;
  }
  const out: SnapshotInfo[] = [];
  for (const name of names) {
    const m = SNAPSHOT_RE.exec(name);
    if (!m) continue;
    const path = join(dir, name);
    let bytes = 0;
    try {
      const st = statSync(path);
      if (!st.isFile()) continue;
      bytes = st.size;
    } catch {
      continue;
    }
    out.push({ name, path, takenAt: stampToMs(m[1]!, m[2]!), bytes });
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/** Delete all but the newest `keep` snapshots (never fewer than 1). Returns deleted names. */
export function rotateSnapshots(dir: string, keep: number = BACKUP_KEEP): string[] {
  const drop = listSnapshots(dir).slice(Math.max(1, keep));
  for (const s of drop) unlinkSync(s.path);
  return drop.map((s) => s.name);
}

let schemaTablesCache: string[] | null = null;

/** Tables a DB migrated to SCHEMA_VERSION has (fresh in-memory migrate). */
export function currentSchemaTables(): string[] {
  if (schemaTablesCache) return schemaTablesCache;
  const db = new Database(":memory:");
  try {
    migrateCorvidinhoDb(db);
    schemaTablesCache = userTables(db);
    return schemaTablesCache;
  } finally {
    db.close();
  }
}

function userTables(db: Database): string[] {
  return (
    db
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>
  ).map((r) => r.name);
}

export type DbFileCheck =
  | { ok: true; schemaVersion: number; counts: Record<string, number> }
  | { ok: false; error: string };

/**
 * Open a DB file read-only and check it: `PRAGMA integrity_check` is `ok`,
 * `schema_meta.version` is 1..SCHEMA_VERSION, a DB at SCHEMA_VERSION has
 * every table of the current schema, and every table can be counted.
 */
export function checkDbFile(path: string): DbFileCheck {
  let db: Database | undefined;
  try {
    db = new Database(path, { readonly: true });
    const integrity = db.query("PRAGMA integrity_check").all() as Array<Record<string, unknown>>;
    const first = integrity[0] ? Object.values(integrity[0])[0] : undefined;
    if (integrity.length !== 1 || first !== "ok") {
      return { ok: false, error: `integrity_check: ${String(first ?? "no result").slice(0, 120)}` };
    }
    const tables = userTables(db);
    if (!tables.includes("schema_meta")) return { ok: false, error: "no schema_meta table" };
    const row = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    } | null;
    const version = row ? Number(row.value) : Number.NaN;
    if (!Number.isInteger(version) || version < 1) {
      return { ok: false, error: "no schema version in schema_meta" };
    }
    if (version > SCHEMA_VERSION) {
      return {
        ok: false,
        error: `schema version ${version} is newer than this build (${SCHEMA_VERSION})`,
      };
    }
    if (version === SCHEMA_VERSION) {
      const missing = currentSchemaTables().filter((t) => !tables.includes(t));
      if (missing.length > 0) return { ok: false, error: `missing table(s): ${missing.join(", ")}` };
    }
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const c = db.query(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`).get() as {
        n: number;
      };
      counts[t] = c.n;
    }
    return { ok: true, schemaVersion: version, counts };
  } catch (err) {
    return { ok: false, error: formatErrorLine(err, { max: ERROR_MAX }) };
  } finally {
    try {
      db?.close();
    } catch {
      // already closed
    }
  }
}

function fsyncPath(path: string, flags: "r" | "r+" = "r"): void {
  const fd = openSync(path, flags);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** With a private umask: files created meanwhile are 0600, dirs 0700. */
function withPrivateUmask<T>(fn: () => T): T {
  const old = process.umask(0o077);
  try {
    return fn();
  } finally {
    process.umask(old);
  }
}

export type SnapshotResult =
  | {
      ok: true;
      snapshot: SnapshotInfo;
      schemaVersion: number;
      counts: Record<string, number>;
      /** Older snapshots deleted by rotation. */
      removed: string[];
    }
  | { ok: false; error: string };

/**
 * Take one snapshot of `db` into `dir` (created 0700 when missing) and
 * rotate. Never throws; a failure leaves no partial file behind.
 */
export function takeSnapshot(
  db: Database,
  dir: string,
  opts: { now: number; keep?: number },
): SnapshotResult {
  const name = snapshotName(opts.now);
  const final = join(dir, name);
  const tmp = join(dir, `.${name}.tmp`);
  try {
    const refusal = backupDirRefusal(dir);
    if (refusal) return { ok: false, error: refusal };
    withPrivateUmask(() => mkdirSync(dir, { recursive: true, mode: 0o700 }));
    if (existsSync(final)) return { ok: false, error: `${name} already exists in ${dir}` };
    rmSync(tmp, { force: true });
    // SAFE-6: the snapshot copies rows as stored; re-scrub first when the
    // rules tightened since this DB was opened (a no-op otherwise).
    ensureScrubbed(db);
    withPrivateUmask(() => db.run("VACUUM INTO ?", [tmp]));
    chmodSync(tmp, 0o600);
    fsyncPath(tmp);
    const check = checkDbFile(tmp);
    if (!check.ok) {
      rmSync(tmp, { force: true });
      return { ok: false, error: `snapshot check failed: ${check.error}` };
    }
    renameSync(tmp, final);
    try {
      fsyncPath(dir);
    } catch {
      // Some filesystems refuse a directory fsync; the rename already happened.
    }
    const removed = rotateSnapshots(dir, opts.keep ?? BACKUP_KEEP);
    return {
      ok: true,
      snapshot: {
        name,
        path: final,
        takenAt: Math.floor(opts.now / 1000) * 1000,
        bytes: statSync(final).size,
      },
      schemaVersion: check.schemaVersion,
      counts: check.counts,
      removed,
    };
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // nothing to clean
    }
    return { ok: false, error: formatErrorLine(err, { max: ERROR_MAX }) };
  }
}

/**
 * Pids of processes holding `path` (or its SQLite -journal / -wal / -shm)
 * open, from /proc/<pid>/fd (Linux; processes of other users are not
 * visible unless run as root). For a target named `corvidinho.db`, a live
 * `daemon.lock` next to it counts too.
 */
export function processesHolding(path: string): number[] {
  let real: string;
  try {
    real = realpathSync(path);
  } catch {
    real = resolve(path);
  }
  const wanted = new Set([real, `${real}-journal`, `${real}-wal`, `${real}-shm`]);
  const pids = new Set<number>();
  let entries: string[] = [];
  try {
    entries = readdirSync("/proc");
  } catch {
    entries = [];
  }
  for (const e of entries) {
    if (!/^\d+$/.test(e)) continue;
    let fds: string[];
    try {
      fds = readdirSync(`/proc/${e}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      let link: string;
      try {
        link = readlinkSync(`/proc/${e}/fd/${fd}`);
      } catch {
        continue;
      }
      if (wanted.has(link)) {
        pids.add(Number(e));
        break;
      }
    }
  }
  if (basename(real) === LIVE_DB_NAME) {
    try {
      const holder = JSON.parse(readFileSync(daemonLockPath(dirname(real)), "utf8")) as {
        pid?: unknown;
        procStart?: unknown;
      };
      if (
        typeof holder.pid === "number" &&
        isHolderAlive({
          pid: holder.pid,
          startedAt: "",
          procStart: typeof holder.procStart === "string" ? holder.procStart : null,
        })
      ) {
        pids.add(holder.pid);
      }
    } catch {
      // no lock, or unreadable: nothing more to add
    }
  }
  return [...pids].sort((a, b) => a - b);
}

export type RestoreResult =
  | {
      ok: true;
      snapshot: string;
      target: string;
      schemaVersion: number;
      counts: Record<string, number>;
    }
  | { ok: false; error: string };

export type RestoreOptions = {
  /** Backup directory holding the snapshot. */
  dir: string;
  /** Snapshot file name as `backup list` prints it (no path). */
  name: string;
  /** Where to write the restored DB. */
  target: string;
  /** Replace an existing target nobody holds open. */
  force?: boolean;
  /** Test seam: holder lookup (default processesHolding). */
  holders?: (path: string) => number[];
};

/**
 * Restore snapshot `name` from `dir` to `target`: the snapshot is checked
 * first; a target a process holds open is refused (even with `force`); an
 * existing target needs `force`. The copy is written next to the target
 * (0600), fsynced, stale -journal/-wal/-shm of the old file removed, then
 * renamed over it, and the restored file is checked again. Never throws.
 */
export function restoreSnapshot(opts: RestoreOptions): RestoreResult {
  const holders = opts.holders ?? processesHolding;
  if (!SNAPSHOT_RE.test(opts.name)) {
    return {
      ok: false,
      error: `not a snapshot name: ${opts.name} — use a name from \`corvidinho backup list\``,
    };
  }
  const src = join(opts.dir, opts.name);
  if (!existsSync(src)) return { ok: false, error: `no snapshot ${opts.name} in ${opts.dir}` };
  const srcCheck = checkDbFile(src);
  if (!srcCheck.ok) {
    return { ok: false, error: `snapshot ${opts.name} is not usable: ${srcCheck.error}` };
  }
  const target = resolve(opts.target);
  const sidecars = ["-journal", "-wal", "-shm"].map((s) => `${target}${s}`);
  const heldBy = (): string | null => {
    const pids = holders(target);
    return pids.length > 0
      ? `${target} is open in process ${pids.join(", ")} — stop the bridge, daemon and any agent run using it first; a DB a process holds is never overwritten`
      : null;
  };
  let targetExists = false;
  try {
    if (statSync(target).isDirectory()) {
      return { ok: false, error: `${target} is a directory — give the target file path` };
    }
    targetExists = true;
  } catch {
    targetExists = false;
  }
  if (targetExists || sidecars.some((s) => existsSync(s))) {
    const held = heldBy();
    if (held) return { ok: false, error: held };
    if (targetExists && !opts.force) {
      return {
        ok: false,
        error: `${target} exists — pass --force to replace it (stop the bridge and daemon first)`,
      };
    }
  }
  const tmp = join(dirname(target), `.${basename(target)}.restore-${process.pid}-${Date.now()}.tmp`);
  try {
    withPrivateUmask(() => {
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      copyFileSync(src, tmp);
    });
    chmodSync(tmp, 0o600);
    fsyncPath(tmp);
    // Re-check right before replacing: a process may have opened it meanwhile.
    if (targetExists) {
      const held = heldBy();
      if (held) {
        rmSync(tmp, { force: true });
        return { ok: false, error: held };
      }
    }
    // A leftover journal of the old file would be replayed into the restored one.
    for (const s of sidecars) rmSync(s, { force: true });
    renameSync(tmp, target);
    try {
      fsyncPath(dirname(target));
    } catch {
      // directory fsync unsupported: the rename already happened
    }
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // nothing to clean
    }
    return { ok: false, error: formatErrorLine(err, { max: ERROR_MAX }) };
  }
  const check = checkDbFile(target);
  if (!check.ok) return { ok: false, error: `restored copy failed its check: ${check.error}` };
  return {
    ok: true,
    snapshot: opts.name,
    target,
    schemaVersion: check.schemaVersion,
    counts: check.counts,
  };
}

export type RestoreTestResult =
  | {
      ok: true;
      snapshot: string;
      schemaVersion: number;
      counts: Record<string, number>;
    }
  | { ok: false; snapshot?: string; error: string };

/**
 * OPS-2: restore the newest snapshot in `dir` into a fresh temp dir with
 * `restoreSnapshot`, which opens and checks the restored copy; when
 * `expected` names that snapshot, every table's row count must match what
 * was recorded when it was taken. The temp dir is always deleted.
 */
export function runRestoreTest(
  dir: string,
  opts: {
    tmpRoot?: string;
    expected?: { snapshot: string; counts: Record<string, number> } | null;
  } = {},
): RestoreTestResult {
  let latest: SnapshotInfo | undefined;
  try {
    latest = listSnapshots(dir)[0];
  } catch (err) {
    return { ok: false, error: formatErrorLine(err, { max: ERROR_MAX }) };
  }
  if (!latest) return { ok: false, error: `no snapshot in ${dir} to test` };
  let tmp: string | undefined;
  try {
    tmp = withPrivateUmask(() =>
      mkdtempSync(join(opts.tmpRoot ?? tmpdir(), "corvidinho-restore-test-")),
    );
    const r = restoreSnapshot({ dir, name: latest.name, target: join(tmp, LIVE_DB_NAME) });
    if (!r.ok) return { ok: false, snapshot: latest.name, error: r.error };
    const expected = opts.expected;
    if (expected && expected.snapshot === latest.name) {
      const diffs: string[] = [];
      for (const [table, n] of Object.entries(expected.counts)) {
        const got = r.counts[table];
        if (got !== n) diffs.push(`${table} ${got ?? "missing"} (backed up ${n})`);
      }
      if (diffs.length > 0) {
        return {
          ok: false,
          snapshot: latest.name,
          error: `row counts differ after restore: ${diffs.join(", ")}`,
        };
      }
    }
    return { ok: true, snapshot: latest.name, schemaVersion: r.schemaVersion, counts: r.counts };
  } catch (err) {
    return { ok: false, snapshot: latest.name, error: formatErrorLine(err, { max: ERROR_MAX }) };
  } finally {
    if (tmp) {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }
  }
}

// --- State in schema_meta -----------------------------------------------------

export type BackupJob = "backup" | "restore_test";

const NIGHT_KEY = "ops_backup_night";
const LAST_SNAPSHOT_KEY = "ops_backup_last_snapshot";
const key = (job: BackupJob, field: string) => `ops_${job}_${field}`;

function getMeta(db: Database, k: string): string | null {
  const row = db.query("SELECT value FROM schema_meta WHERE key = ?").get(k) as {
    value: string;
  } | null;
  return row ? row.value : null;
}

function setMeta(db: Database, k: string, v: string): void {
  db.run(
    `INSERT INTO schema_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [k, v],
  );
}

function deleteMeta(db: Database, k: string): void {
  db.run("DELETE FROM schema_meta WHERE key = ?", [k]);
}

function numMeta(db: Database, k: string): number | null {
  const v = getMeta(db, k);
  const n = v === null ? Number.NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Local calendar day `YYYY-MM-DD` of `now`. */
export function localDay(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Claim tonight's backup slot: due from BACKUP_HOUR local time, once per
 * local day per data dir (IMMEDIATE transaction, so of a bridge and a
 * daemon on one data dir only one claims it).
 */
export function claimBackupNight(db: Database, now: number): boolean {
  if (new Date(now).getHours() < BACKUP_HOUR) return false;
  const day = localDay(now);
  return db
    .transaction(() => {
      if (getMeta(db, NIGHT_KEY) === day) return false;
      setMeta(db, NIGHT_KEY, day);
      return true;
    })
    .immediate();
}

/**
 * Record a failed job. Returns true when this failure starts a streak: the
 * owner notice is then recorded (pending until a bridge posts it). The
 * error is stored scrubbed, on one line, for doctor.
 */
export function recordJobFailure(db: Database, job: BackupJob, now: number, error: string): boolean {
  return db
    .transaction(() => {
      setMeta(db, key(job, "last_error"), scrubSecrets(error).replace(/\s+/g, " ").slice(0, ERROR_MAX));
      if (numMeta(db, key(job, "failing_since")) !== null) return false;
      setMeta(db, key(job, "failing_since"), String(now));
      setMeta(db, key(job, "notice"), String(now));
      return true;
    })
    .immediate();
}

/** Record a successful job; returns true when it ended a failure streak. */
export function recordJobSuccess(db: Database, job: BackupJob, now: number): boolean {
  return db
    .transaction(() => {
      const wasFailing = numMeta(db, key(job, "failing_since")) !== null;
      deleteMeta(db, key(job, "failing_since"));
      deleteMeta(db, key(job, "last_error"));
      setMeta(db, key(job, "last_ok_at"), String(now));
      return wasFailing;
    })
    .immediate();
}

export type JobStatus = {
  lastOkAt: number | null;
  /** Start of the current failure streak, or null when the last run was ok. */
  failingSince: number | null;
  lastError: string | null;
  /** The owner has not been told about this job's failure yet. */
  noticePending: boolean;
};

export type BackupStatus = {
  /** Local day of the last claimed night, or null. */
  night: string | null;
  backup: JobStatus;
  restoreTest: JobStatus & { lastAt: number | null };
};

function jobStatus(db: Database, job: BackupJob): JobStatus {
  return {
    lastOkAt: numMeta(db, key(job, "last_ok_at")),
    failingSince: numMeta(db, key(job, "failing_since")),
    lastError: getMeta(db, key(job, "last_error")),
    noticePending: numMeta(db, key(job, "notice")) !== null,
  };
}

/** Backup / restore-test state for doctor and logs. */
export function readBackupStatus(db: Database): BackupStatus {
  return {
    night: getMeta(db, NIGHT_KEY),
    backup: jobStatus(db, "backup"),
    restoreTest: { ...jobStatus(db, "restore_test"), lastAt: numMeta(db, key("restore_test", "last_at")) },
  };
}

function readLastSnapshot(db: Database): { snapshot: string; counts: Record<string, number> } | null {
  const raw = getMeta(db, LAST_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { snapshot?: unknown; counts?: unknown };
    if (typeof v.snapshot !== "string" || !v.counts || typeof v.counts !== "object") return null;
    return { snapshot: v.snapshot, counts: v.counts as Record<string, number> };
  } catch {
    return null;
  }
}

/** The restore test is due: never ran, last attempt ≥ a week ago, or it is failing. */
export function restoreTestDue(db: Database, now: number): boolean {
  const last = numMeta(db, key("restore_test", "last_at"));
  if (last === null) return true;
  if (numMeta(db, key("restore_test", "failing_since")) !== null) return true;
  return now - last >= RESTORE_TEST_INTERVAL_MS;
}

export type PendingBackupNotice = { job: BackupJob; at: number };

/** Owner notices recorded and not yet posted. */
export function pendingBackupNotices(db: Database): PendingBackupNotice[] {
  const out: PendingBackupNotice[] = [];
  for (const job of ["backup", "restore_test"] as const) {
    const at = numMeta(db, key(job, "notice"));
    if (at !== null) out.push({ job, at });
  }
  return out;
}

/** Take a pending notice (compare-and-delete); false when another poster took it. */
export function claimBackupNotice(db: Database, n: PendingBackupNotice): boolean {
  return (
    db.run("DELETE FROM schema_meta WHERE key = ? AND value = ?", [key(n.job, "notice"), String(n.at)])
      .changes === 1
  );
}

/** Hand a claimed notice back (a newer one recorded meanwhile wins). */
export function releaseBackupNotice(db: Database, n: PendingBackupNotice): void {
  db.run("INSERT OR IGNORE INTO schema_meta (key, value) VALUES (?, ?)", [
    key(n.job, "notice"),
    String(n.at),
  ]);
}

function utcMinute(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * Owner notice text: fixed wording plus the time, never a host path or the
 * error (those stay in the host log and `corvidinho doctor`).
 */
export function formatBackupNotice(n: PendingBackupNotice): string {
  if (n.job === "backup") {
    return `⚠️ The nightly backup failed (${utcMinute(n.at)}). Run \`corvidinho doctor\` on the host for the reason; it tries again next night. (OPS-1)`;
  }
  return `⚠️ The restore test failed (${utcMinute(n.at)}): the newest backup could not be restored and checked. Run \`corvidinho doctor\` on the host for the reason; it tries again next night. (OPS-2)`;
}

// --- Ticker ----------------------------------------------------------------

export type BackupLogLevel = "info" | "warn" | "error";
/** Same shape as the daemon logger (src/daemon/log.ts). */
export type BackupLog = (
  level: BackupLogLevel,
  event: string,
  fields?: Record<string, unknown>,
) => void;

/** Post one owner notice; resolve true only when it went out. */
export type BackupNotify = (notice: PendingBackupNotice & { content: string }) => Promise<boolean>;

export type BackupTicker = {
  /** Run the nightly backup / restore test when due, deliver notices. Never throws. */
  tick(now: number): void;
  /** Wait for a notice post in flight (tests, shutdown). */
  settle(): Promise<void>;
};

/** Bridge log sink: one scrubbed `[backup] <event> {json}` console line. */
export const consoleBackupLog: BackupLog = (level, event, fields = {}) => {
  const line = `[backup] ${event} ${scrubSecrets(JSON.stringify(fields))}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

/**
 * The nightly backup + restore test ticker over the shared DB. `notify` is
 * wired only where the owner can be told (the bridge); without it notices
 * stay pending for the next bridge tick.
 */
export function createBackupTicker(opts: {
  db: Database;
  env?: NodeJS.ProcessEnv;
  log: BackupLog;
  notify?: BackupNotify;
  /** Parent of the restore test's temp dir (default os.tmpdir()). */
  tmpRoot?: string;
}): BackupTicker {
  const { db, log, notify } = opts;
  const env = opts.env ?? process.env;
  let delivering: Promise<void> | null = null;
  const waitingLogged = new Set<BackupJob>();

  const fail = (job: BackupJob, event: string, now: number, error: string, fields: Record<string, unknown>) => {
    let started = false;
    try {
      started = recordJobFailure(db, job, now, error);
    } catch (err) {
      log("error", `${job}.state_failed`, { error: formatErrorLine(err, { max: ERROR_MAX }) });
    }
    log("error", event, {
      ...fields,
      error,
      ownerNotice: started ? "recorded" : "already recorded this failure streak",
    });
  };

  const runNight = (now: number) => {
    const cfg = resolveBackupConfig(env);
    if (cfg.kind === "off") return;
    if (cfg.kind === "invalid") {
      fail("backup", "backup.failed", now, cfg.error, {});
      return;
    }
    const snap = takeSnapshot(db, cfg.dir, { now });
    if (snap.ok) {
      let recovered = false;
      try {
        setMeta(db, LAST_SNAPSHOT_KEY, JSON.stringify({ snapshot: snap.snapshot.name, counts: snap.counts }));
        recovered = recordJobSuccess(db, "backup", now);
      } catch (err) {
        log("error", "backup.state_failed", { error: formatErrorLine(err, { max: ERROR_MAX }) });
      }
      log("info", "backup.ok", {
        dir: cfg.dir,
        snapshot: snap.snapshot.name,
        bytes: snap.snapshot.bytes,
        schemaVersion: snap.schemaVersion,
        counts: snap.counts,
        removed: snap.removed,
        ...(recovered ? { recovered: true } : {}),
      });
    } else {
      fail("backup", "backup.failed", now, snap.error, { dir: cfg.dir });
    }
    if (!restoreTestDue(db, now)) return;
    let hasSnapshot = false;
    try {
      hasSnapshot = listSnapshots(cfg.dir).length > 0;
    } catch {
      hasSnapshot = false;
    }
    if (!hasSnapshot) {
      // Nothing to restore yet: the failed backup above is what the owner
      // hears about; the test runs on the first night a snapshot exists.
      log("warn", "restore_test.skipped", { dir: cfg.dir, reason: "no snapshot to test yet" });
      return;
    }
    try {
      setMeta(db, key("restore_test", "last_at"), String(now));
    } catch (err) {
      log("error", "restore_test.state_failed", { error: formatErrorLine(err, { max: ERROR_MAX }) });
    }
    const test = runRestoreTest(cfg.dir, { tmpRoot: opts.tmpRoot, expected: readLastSnapshot(db) });
    if (test.ok) {
      let recovered = false;
      try {
        recovered = recordJobSuccess(db, "restore_test", now);
      } catch (err) {
        log("error", "restore_test.state_failed", { error: formatErrorLine(err, { max: ERROR_MAX }) });
      }
      log("info", "restore_test.ok", {
        dir: cfg.dir,
        snapshot: test.snapshot,
        schemaVersion: test.schemaVersion,
        counts: test.counts,
        ...(recovered ? { recovered: true } : {}),
      });
    } else {
      fail("restore_test", "restore_test.failed", now, test.error, {
        dir: cfg.dir,
        ...(test.snapshot ? { snapshot: test.snapshot } : {}),
      });
    }
  };

  const deliver = () => {
    if (!notify || delivering) return;
    const pending = pendingBackupNotices(db);
    if (pending.length === 0) return;
    delivering = (async () => {
      for (const n of pending) {
        if (!claimBackupNotice(db, n)) continue;
        let sent = false;
        try {
          sent = await notify({ ...n, content: formatBackupNotice(n) });
        } catch {
          sent = false;
        }
        if (sent) {
          waitingLogged.delete(n.job);
          log("info", `${n.job}.owner_told`, { failedAt: new Date(n.at).toISOString() });
        } else {
          releaseBackupNotice(db, n);
          if (!waitingLogged.has(n.job)) {
            waitingLogged.add(n.job);
            log("warn", `${n.job}.owner_not_told`, {
              failedAt: new Date(n.at).toISOString(),
              reason: "the post did not go out (no announcements channel set, or Discord refused it); retried every tick",
            });
          }
        }
      }
    })()
      .catch((err) => log("error", "backup.notice_failed", { error: formatErrorLine(err, { max: ERROR_MAX }) }))
      .finally(() => {
        delivering = null;
      });
  };

  return {
    tick(now: number) {
      try {
        if (resolveBackupConfig(env).kind !== "off" && claimBackupNight(db, now)) runNight(now);
      } catch (err) {
        log("error", "backup.tick_failed", { error: formatErrorLine(err, { max: ERROR_MAX }) });
      }
      try {
        deliver();
      } catch (err) {
        log("error", "backup.notice_failed", { error: formatErrorLine(err, { max: ERROR_MAX }) });
      }
    },
    async settle() {
      await delivering;
    },
  };
}
