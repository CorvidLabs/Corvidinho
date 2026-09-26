/**
 * Single-instance lock for `corvidinho daemon` (CLI-8 / AUTONOMOUS-4).
 *
 * `<data dir>/daemon.lock` is created with O_EXCL and holds the owner's pid
 * plus its Linux /proc start time. A lock whose pid is gone — or whose pid was
 * recycled by another process (start time differs) — is stale and taken over,
 * so a crash never wedges the next start. Release removes the file only while
 * it still names this process.
 */

import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

export const DAEMON_LOCK_FILE = "daemon.lock";

/**
 * An unreadable lock file younger than this may belong to a starter that has
 * created it but not written it yet — never treat it as stale.
 */
const PARTIAL_LOCK_GRACE_MS = 5_000;

export type DaemonLockHolder = {
  pid: number;
  startedAt: string;
  /** Field 22 of /proc/<pid>/stat (null when /proc is unavailable). */
  procStart: string | null;
};

export type DaemonLock = {
  path: string;
  holder: DaemonLockHolder;
  /** Remove the lock file if it still names this holder. Idempotent. */
  release: () => void;
};

export type AcquireDaemonLockResult =
  | { ok: true; lock: DaemonLock }
  | {
      ok: false;
      path: string;
      reason: "held" | "contended" | "error";
      holder: DaemonLockHolder | null;
      message: string;
    };

export type AcquireDaemonLockOptions = {
  dataDir: string;
  /** Test seams. */
  pid?: number;
  now?: () => Date;
  isAlive?: (holder: DaemonLockHolder) => boolean;
  procStartOf?: (pid: number) => string | null;
};

export function daemonLockPath(dataDir: string): string {
  return join(dataDir, DAEMON_LOCK_FILE);
}

/** Start time of `pid` from /proc/<pid>/stat, or null (Linux-only). */
export function readProcStart(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // comm (field 2) may contain spaces or parens: fields resume after the last ')'.
    const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    // rest[0] is field 3 (state); starttime is field 22.
    return rest[19] ?? null;
  } catch {
    return null;
  }
}

/** True when the holder's process still runs (and is the same process). */
export function isHolderAlive(
  holder: DaemonLockHolder,
  procStartOf: (pid: number) => string | null = readProcStart,
): boolean {
  if (!Number.isInteger(holder.pid) || holder.pid <= 0) return false;
  try {
    process.kill(holder.pid, 0);
  } catch (err) {
    // EPERM: the pid exists but belongs to another user — still alive.
    if ((err as NodeJS.ErrnoException).code !== "EPERM") return false;
  }
  if (holder.procStart) {
    const current = procStartOf(holder.pid);
    if (current !== null && current !== holder.procStart) return false;
  }
  return true;
}

function parseHolder(raw: string): DaemonLockHolder | null {
  try {
    const v = JSON.parse(raw) as Partial<DaemonLockHolder>;
    if (typeof v.pid !== "number" || !Number.isInteger(v.pid)) return null;
    return {
      pid: v.pid,
      startedAt: typeof v.startedAt === "string" ? v.startedAt : "",
      procStart: typeof v.procStart === "string" ? v.procStart : null,
    };
  } catch {
    return null;
  }
}

function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function sameHolder(a: DaemonLockHolder, b: DaemonLockHolder): boolean {
  return a.pid === b.pid && a.procStart === b.procStart;
}

/**
 * Take the daemon lock in `dataDir`, or report who holds it.
 */
export function acquireDaemonLock(
  opts: AcquireDaemonLockOptions,
): AcquireDaemonLockResult {
  const path = daemonLockPath(opts.dataDir);
  const pid = opts.pid ?? process.pid;
  const procStartOf = opts.procStartOf ?? readProcStart;
  const isAlive = opts.isAlive ?? ((h) => isHolderAlive(h, procStartOf));
  const me: DaemonLockHolder = {
    pid,
    startedAt: (opts.now?.() ?? new Date()).toISOString(),
    procStart: procStartOf(pid),
  };

  try {
    mkdirSync(opts.dataDir, { recursive: true, mode: 0o700 });
  } catch (err) {
    return {
      ok: false,
      path,
      reason: "error",
      holder: null,
      message: `cannot create data dir: ${(err as Error).message}`,
    };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(path, "wx", 0o600);
      try {
        writeSync(fd, `${JSON.stringify(me)}\n`);
      } finally {
        closeSync(fd);
      }
      return { ok: true, lock: makeLock(path, me) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
        return {
          ok: false,
          path,
          reason: "error",
          holder: null,
          message: `cannot create lock: ${(err as Error).message}`,
        };
      }
    }

    const raw = readIfExists(path);
    if (raw === null) continue; // released between open and read — retry
    const holder = parseHolder(raw);
    if (holder) {
      if (sameHolder(holder, me) || isAlive(holder)) {
        return {
          ok: false,
          path,
          reason: "held",
          holder,
          message: `another corvidinho daemon is running (pid ${holder.pid}, since ${holder.startedAt || "unknown"}); lock ${path}`,
        };
      }
    } else {
      // Unreadable: a starter may be between create and write.
      let ageMs = Number.POSITIVE_INFINITY;
      try {
        ageMs = Date.now() - statSync(path).mtimeMs;
      } catch {
        continue;
      }
      if (ageMs < PARTIAL_LOCK_GRACE_MS) break;
    }
    // Stale: remove only if nobody replaced it since we read it.
    if (readIfExists(path) === raw) {
      try {
        unlinkSync(path);
      } catch {
        // already gone — retry the create
      }
    }
  }
  return {
    ok: false,
    path,
    reason: "contended",
    holder: null,
    message: `could not take daemon lock ${path} (another start is in progress?)`,
  };
}

function makeLock(path: string, holder: DaemonLockHolder): DaemonLock {
  let released = false;
  return {
    path,
    holder,
    release() {
      if (released) return;
      released = true;
      const raw = readIfExists(path);
      const current = raw === null ? null : parseHolder(raw);
      if (current && sameHolder(current, holder)) {
        try {
          unlinkSync(path);
        } catch {
          // already removed
        }
      }
    },
  };
}
