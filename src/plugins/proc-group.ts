/**
 * Stop a bounded child and everything it started (AGENT-3 / SAFE-1).
 *
 * Linux only. A child that must not outlive a timeout or abort is spawned
 * with `detached: true` (setsid: its own session and process group, pgid =
 * pid). Stopping it signals:
 *   - every process group led by a member of its tree, including the child's
 *     own group after the child exited (an orphaned grandchild still in it);
 *   - every descendant found by walking `/proc` ppid links, so a grandchild
 *     that moved to its own group (a nested delegate worker, a native plugin
 *     that calls setsid) is reached while its parent lives.
 * A hard kill freezes the tree with SIGSTOP first, re-reads `/proc` until no
 * new member appears, then SIGKILLs, so nothing forks away mid-sweep.
 *
 * Pid reuse: the root pid is trusted only while it is still this process's
 * child (or matches a `known` start time); a group whose leader exited is
 * trusted only through a `known` member still in it (a live group keeps its
 * id from being reused) or a snapshot taken as the leader exited.
 *
 * Detached children no longer get the terminal's SIGINT / SIGHUP, so tracked
 * children are killed when this process exits, and when SIGINT / SIGTERM /
 * SIGHUP would kill it (no other listener): the tree is stopped, then the
 * signal is re-raised with its default action. A process that handles those
 * signals itself (bridge, daemon) keeps its own shutdown and grace. A signal
 * this process started with ignored (`nohup`, a background job's SIGINT) is
 * never hooked: it stays ignored, as without this module.
 *
 * Never throws; this process, its own group and pid 1 are never signalled.
 */

import { readdirSync, readFileSync } from "node:fs";
import { constants } from "node:os";

export type ProcEntry = {
  pid: number;
  ppid: number;
  pgid: number;
  /** `/proc/<pid>/stat` starttime: tells a recycled pid apart. */
  start: string;
};

export type ProcTreeOptions = {
  /** Snapshot to read instead of `/proc` (tests). */
  table?: Map<number, ProcEntry>;
  /** Members from an earlier snapshot; kept when pid and start time still match. */
  known?: readonly ProcEntry[];
  /** The root just exited (caller saw it): its group id is still its own. */
  rootJustExited?: boolean;
};

/** Parse one `/proc/<pid>/stat` line (comm may contain spaces or parens). */
export function parseProcStat(pid: number, stat: string): ProcEntry | null {
  const close = stat.lastIndexOf(")");
  if (close < 0) return null;
  // Fields after comm: state(3) ppid(4) pgrp(5) … starttime(22).
  const f = stat.slice(close + 2).split(" ");
  const ppid = Number(f[1]);
  const pgid = Number(f[2]);
  const start = f[19];
  if (!Number.isInteger(ppid) || !Number.isInteger(pgid) || !start) return null;
  return { pid, ppid, pgid, start };
}

/** Snapshot of live processes from `/proc` (empty when unreadable). */
export function readProcTable(procRoot = "/proc"): Map<number, ProcEntry> {
  const table = new Map<number, ProcEntry>();
  let names: string[];
  try {
    names = readdirSync(procRoot);
  } catch {
    return table;
  }
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const e = parseProcStat(Number(name), readFileSync(`${procRoot}/${name}/stat`, "utf8"));
      if (e) table.set(e.pid, e);
    } catch {
      /* exited meanwhile */
    }
  }
  return table;
}

function safeTarget(pid: number): boolean {
  return Number.isInteger(pid) && pid > 1 && pid !== process.pid;
}

/**
 * The live tree under `root`: `root` while it is still ours, its `/proc`
 * descendants, members of any group led by a tree member (or of `root`'s
 * group while trusted), and still-live `known` entries — to a fixpoint.
 */
export function collectProcessTree(root: number, opts: ProcTreeOptions = {}): ProcEntry[] {
  const table = opts.table ?? readProcTable();
  const members = new Map<number, ProcEntry>();
  const knownPids = new Set<number>();
  for (const k of opts.known ?? []) {
    const now = table.get(k.pid);
    if (now && now.start === k.start && safeTarget(now.pid)) {
      members.set(now.pid, now);
      knownPids.add(now.pid);
    }
  }
  const rootEntry = table.get(root);
  const rootOurs =
    rootEntry !== undefined && (rootEntry.ppid === process.pid || knownPids.has(root));
  if (rootOurs) members.set(root, rootEntry);
  const rootGroup =
    rootOurs ||
    opts.rootJustExited === true ||
    [...members.values()].some((m) => m.pgid === root);

  // Parents: tree members. Groups: led by a tree member, or the root's.
  const parents = new Set<number>(members.keys());
  const groups = new Set<number>([...members.values()].filter((m) => m.pgid === m.pid).map((m) => m.pid));
  if (rootGroup) groups.add(root);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of table.values()) {
      if (members.has(e.pid) || !safeTarget(e.pid)) continue;
      if (parents.has(e.ppid) || groups.has(e.pgid)) {
        members.set(e.pid, e);
        parents.add(e.pid);
        if (e.pgid === e.pid) groups.add(e.pid);
        grew = true;
      }
    }
  }
  return [...members.values()];
}

function ownPgid(): number {
  try {
    return parseProcStat(process.pid, readFileSync("/proc/self/stat", "utf8"))?.pgid ?? -1;
  } catch {
    return -1;
  }
}

function send(target: number, signal: NodeJS.Signals): void {
  try {
    process.kill(target, signal);
  } catch {
    /* gone, or not ours */
  }
}

/** Signal each group the members form or belong to under `root`, then each member. */
function signalAll(root: number, members: readonly ProcEntry[], signal: NodeJS.Signals): void {
  const mine = ownPgid();
  const groups = new Set<number>();
  for (const m of members) {
    if (m.pgid === m.pid || m.pgid === root) groups.add(m.pgid);
  }
  for (const g of groups) {
    if (safeTarget(g) && g !== mine) send(-g, signal);
  }
  for (const m of members) send(m.pid, signal);
}

/**
 * Send `signal` to the tree under `root` (graceful stop). Returns the members
 * signalled; pass them as `known` to a later {@link killProcessTree} so
 * grandchildren orphaned meanwhile are still found.
 */
export function signalProcessTree(
  root: number,
  signal: NodeJS.Signals,
  opts: Omit<ProcTreeOptions, "table"> = {},
): ProcEntry[] {
  if (!safeTarget(root)) return [];
  const members = collectProcessTree(root, opts);
  signalAll(root, members, signal);
  return members;
}

/** Freeze (SIGSTOP) then SIGKILL the tree under `root`. Returns the members killed. */
export function killProcessTree(
  root: number,
  opts: Omit<ProcTreeOptions, "table"> = {},
): ProcEntry[] {
  if (!safeTarget(root)) return [];
  const frozen = new Map<number, ProcEntry>();
  for (let round = 0; round < 8; round++) {
    const members = collectProcessTree(root, {
      ...opts,
      known: [...(opts.known ?? []), ...frozen.values()],
    });
    const fresh = members.filter((m) => !frozen.has(m.pid));
    for (const m of fresh) frozen.set(m.pid, m);
    if (fresh.length === 0) break;
    signalAll(root, fresh, "SIGSTOP");
  }
  const all = [...frozen.values()];
  signalAll(root, all, "SIGKILL");
  return all;
}

// --- children that must die with this process ------------------------------

/** Latest snapshot of a tracked child's tree (e.g. taken as it exited). */
export type KnownMembers = () => readonly ProcEntry[];

const tracked = new Map<number, KnownMembers | undefined>();

/**
 * Signals set to ignored in a `/proc/<pid>/status` text (`SigIgn:` mask, bit
 * n-1 for signal n). Unreadable or malformed ⇒ none.
 */
export function ignoredSignals(
  status: string,
  candidates: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"],
): Set<NodeJS.Signals> {
  const out = new Set<NodeJS.Signals>();
  const m = /^SigIgn:\s*([0-9a-fA-F]+)\s*$/m.exec(status);
  if (!m) return out;
  const mask = BigInt(`0x${m[1]}`);
  for (const sig of candidates) {
    const n = constants.signals[sig as keyof typeof constants.signals];
    if (typeof n === "number" && n > 0 && ((mask >> BigInt(n - 1)) & 1n) === 1n) out.add(sig);
  }
  return out;
}

function ignoredAtStart(): Set<NodeJS.Signals> {
  try {
    return ignoredSignals(readFileSync("/proc/self/status", "utf8"));
  } catch {
    return new Set();
  }
}

// Read once, before anything here installs a listener: a listener replaces
// SIG_IGN, and removing the last one restores SIG_DFL, not SIG_IGN.
const STARTED_IGNORED = ignoredAtStart();
const FORWARDED = (["SIGINT", "SIGTERM", "SIGHUP"] as const).filter(
  (sig) => !STARTED_IGNORED.has(sig),
);
const signalHandlers = new Map<NodeJS.Signals, (signal: NodeJS.Signals) => void>();

function knownOf(get: KnownMembers | undefined): readonly ProcEntry[] {
  try {
    return get?.() ?? [];
  } catch {
    return [];
  }
}

function killTracked(): void {
  for (const [pid, known] of [...tracked]) killProcessTree(pid, { known: knownOf(known) });
  tracked.clear();
}

function onExit(): void {
  killTracked();
}

let hooked = false;

function installHooks(): void {
  if (hooked) return;
  hooked = true;
  process.on("exit", onExit);
  for (const sig of FORWARDED) {
    const handler = (signal: NodeJS.Signals) => {
      // Someone else owns shutdown (bridge, daemon grace): let them; the exit
      // hook still stops whatever is left when this process exits.
      if (process.listenerCount(signal) > 1) return;
      killTracked();
      removeHooks();
      // Default action now: die by the same signal, as without this hook.
      send(process.pid, signal);
    };
    signalHandlers.set(sig, handler);
    // First in line: a `once` listener (the bridge) is still counted below.
    process.prependListener(sig, handler);
  }
}

function removeHooks(): void {
  hooked = false;
  process.off("exit", onExit);
  for (const [sig, handler] of signalHandlers) process.off(sig, handler);
  signalHandlers.clear();
}

/**
 * Stop `pid`'s tree when this process exits or is interrupted (see module
 * doc). `known` returns the caller's latest snapshot of the tree (taken as
 * the child exited), so what the child left in its group is still reached
 * once the child itself is gone. Returns the untrack function; call it once
 * the child is done.
 */
export function trackChildProcess(pid: number, known?: KnownMembers): () => void {
  if (!safeTarget(pid)) return () => {};
  tracked.set(pid, known);
  installHooks();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    tracked.delete(pid);
    if (tracked.size === 0) removeHooks();
  };
}

/** Test seam: pids currently tracked. */
export function trackedChildProcesses(): number[] {
  return [...tracked.keys()];
}

/** Test seam: signals the interrupt hook covers (not those started ignored). */
export function forwardedSignals(): NodeJS.Signals[] {
  return [...FORWARDED];
}
