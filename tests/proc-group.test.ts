/**
 * Process-tree stop for bounded children (REQ-plugins-154, AGENT-3): own
 * process group, /proc descendant walk, pid-reuse guards, and children killed
 * when the parent exits or is interrupted. Real `sh` / `sleep` processes in
 * temp dirs; no network.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectProcessTree,
  ignoredSignals,
  killProcessTree,
  parseProcStat,
  signalProcessTree,
  trackChildProcess,
  trackedChildProcesses,
  type ProcEntry,
} from "../src/plugins/proc-group.ts";

const MODULE = join(import.meta.dir, "..", "src", "plugins", "proc-group.ts");

/** Alive and not a zombie (an unreaped orphan counts as dead). */
function running(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
}

async function until(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(20);
  }
  return cond();
}

/** Pid written to `path` by a fixture, once the write is complete. */
async function pidFrom(path: string): Promise<number> {
  let pid = 0;
  await until(() => {
    try {
      pid = Number(readFileSync(path, "utf8").trim());
    } catch {
      pid = 0;
    }
    return Number.isInteger(pid) && pid > 1;
  }, 5000);
  return pid;
}

/** sh child in its own group: a same-group grandchild and a setsid one. */
async function spawnTree(): Promise<{
  proc: ReturnType<typeof Bun.spawn>;
  dir: string;
  bg: number;
  sess: number;
}> {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-procgroup-"));
  const script = [
    `sleep 30 & echo $! > "${dir}/bg.pid"`,
    `setsid sleep 30 & echo $! > "${dir}/sess.pid"`,
    "sleep 30",
  ].join("\n");
  const proc = Bun.spawn(["sh", "-c", script], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    detached: true,
  });
  const bg = await pidFrom(join(dir, "bg.pid"));
  const sess = await pidFrom(join(dir, "sess.pid"));
  await until(() => running(bg) && running(sess));
  return { proc, dir, bg, sess };
}

const e = (pid: number, ppid: number, pgid: number, start = `s${pid}`): ProcEntry => ({
  pid,
  ppid,
  pgid,
  start,
});

describe("proc table parsing and tree walk", () => {
  test("stat parsing survives spaces and parens in comm", () => {
    const fields = ["S", "10", "20", "20", ...Array(15).fill("0"), "12345", "0"];
    const stat = `42 (a (weird) name) ${fields.join(" ")}`;
    expect(parseProcStat(42, stat)).toEqual({ pid: 42, ppid: 10, pgid: 20, start: "12345" });
    expect(parseProcStat(1, "garbage")).toBeNull();
  });

  test("descendants in any group, orphans in the root's group, nothing else", () => {
    const me = process.pid;
    const table = new Map<number, ProcEntry>(
      [
        e(100, me, 100), // root: our child, own group
        e(101, 100, 100), // child in the root's group
        e(102, 101, 102), // grandchild that setsid'd (nested worker)
        e(103, 102, 102), // its child
        e(104, 1, 100), // orphan still in the root's group
        e(105, 1, 105), // unrelated
        e(106, me, 999), // our other child, unrelated group
      ].map((x) => [x.pid, x]),
    );
    const pids = collectProcessTree(100, { table })
      .map((m) => m.pid)
      .sort();
    expect(pids).toEqual([100, 101, 102, 103, 104]);
  });

  test("a recycled root pid (not our child) is not trusted", () => {
    const table = new Map<number, ProcEntry>(
      [e(100, 4242, 100), e(101, 100, 100)].map((x) => [x.pid, x]),
    );
    expect(collectProcessTree(100, { table })).toEqual([]);
  });

  test("after the root exited: its group via a known member or an exit snapshot", () => {
    const table = new Map<number, ProcEntry>(
      [e(104, 1, 100), e(107, 104, 100)].map((x) => [x.pid, x]),
    );
    expect(collectProcessTree(100, { table })).toEqual([]);
    const viaKnown = collectProcessTree(100, { table, known: [e(104, 1, 100)] });
    expect(viaKnown.map((m) => m.pid).sort()).toEqual([104, 107]);
    // A known entry whose pid was recycled (start time differs) is dropped.
    expect(collectProcessTree(100, { table, known: [e(104, 1, 100, "old")] })).toEqual([]);
    const atExit = collectProcessTree(100, { table, rootJustExited: true });
    expect(atExit.map((m) => m.pid).sort()).toEqual([104, 107]);
  });

  test("this process and pid 1 are never members", () => {
    const table = new Map<number, ProcEntry>(
      [e(100, process.pid, 100), e(process.pid, 100, 100), e(1, 100, 100)].map((x) => [x.pid, x]),
    );
    expect(collectProcessTree(100, { table }).map((m) => m.pid)).toEqual([100]);
    expect(killProcessTree(process.pid)).toEqual([]);
    expect(killProcessTree(1)).toEqual([]);
  });
});

describe("stopping real process trees", () => {
  test("killProcessTree stops the child, its group and a setsid grandchild", async () => {
    const { proc, bg, sess } = await spawnTree();
    const killed = killProcessTree(proc.pid).map((m) => m.pid);
    expect(killed).toContain(proc.pid);
    expect(killed).toContain(bg);
    expect(killed).toContain(sess);
    await proc.exited;
    expect(await until(() => !running(bg) && !running(sess))).toBe(true);
  });

  test("SIGTERM snapshot lets a later kill reach grandchildren orphaned meanwhile", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-procgroup-"));
    // The child ignores nothing: SIGTERM kills it, the TERM-proof grandchild lives on.
    const script = `(trap '' TERM; exec sleep 30) & echo $! > "${dir}/bg.pid"\nsleep 30`;
    const proc = Bun.spawn(["sh", "-c", script], { stdin: "ignore", stdout: "ignore", detached: true });
    const bg = await pidFrom(join(dir, "bg.pid"));
    await until(() => running(bg));
    const seen = signalProcessTree(proc.pid, "SIGTERM");
    await proc.exited;
    await Bun.sleep(50);
    expect(running(bg)).toBe(true); // ignored SIGTERM, orphaned
    killProcessTree(proc.pid, { known: seen });
    expect(await until(() => !running(bg))).toBe(true);
  });
});

describe("signals started ignored are left alone", () => {
  test("SigIgn mask: bit n-1 is signal n; malformed means none", () => {
    // HUP (1), INT (2), QUIT (3), PIPE (13), XFSZ (25): a `nohup … &` job.
    expect([...ignoredSignals("Name:\tbun\nSigIgn:\t0000000001001007\nSigCgt:\t0\n")].sort()).toEqual([
      "SIGHUP",
      "SIGINT",
    ]);
    expect([...ignoredSignals("SigIgn:\t0000000000004000\n")]).toEqual(["SIGTERM"]);
    expect(ignoredSignals("SigIgn:\t0000000001001000\n").size).toBe(0);
    expect(ignoredSignals("no mask here").size).toBe(0);
  });
});

describe("tracked children die with their parent", () => {
  type ParentOpts = {
    /** Shell prefix run before exec'ing the parent (e.g. `trap '' HUP`). */
    shell?: string;
    /** The child exits at once, leaving its backgrounded grandchild behind. */
    childExits?: boolean;
  };

  /**
   * A bun parent: runs `before`, spawns a tracked detached tree, runs `then`
   * (`untrack` and `atExit`, the tree seen as the child exited, in scope).
   */
  function parentScript(dir: string, then: string, before = "", opts: ParentOpts = {}): string {
    const path = join(dir, "parent.ts");
    const childScript = opts.childExits
      ? `sleep 30 & echo $! > "${dir}/bg.pid"; exit 0`
      : `sleep 30 & echo $! > "${dir}/bg.pid"; sleep 30`;
    writeFileSync(
      path,
      `import { collectProcessTree, trackChildProcess, type ProcEntry } from ${JSON.stringify(MODULE)};
import { existsSync, writeFileSync } from "node:fs";
${before}
const child = Bun.spawn(["sh", "-c", ${JSON.stringify(childScript)}], {
  stdin: "ignore",
  stdout: "ignore",
  detached: true,
});
let atExit: ProcEntry[] = [];
void child.exited.then(() => {
  atExit = collectProcessTree(child.pid, { rootJustExited: true });
  writeFileSync(${JSON.stringify(join(dir, "child.exited"))}, "1");
});
const untrack = trackChildProcess(child.pid, () => atExit);
writeFileSync(${JSON.stringify(join(dir, "child.pid"))}, String(child.pid));
while (!existsSync(${JSON.stringify(join(dir, "bg.pid"))})) await Bun.sleep(10);
${opts.childExits ? `while (!existsSync(${JSON.stringify(join(dir, "child.exited"))})) await Bun.sleep(10);` : ""}
${then}
writeFileSync(${JSON.stringify(join(dir, "ready"))}, "1");
setInterval(() => {}, 1000);
`,
    );
    return path;
  }

  async function startParent(then: string, before = "", opts: ParentOpts = {}) {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-procgroup-parent-"));
    const script = parentScript(dir, then, before, opts);
    const argv = opts.shell
      ? ["sh", "-c", `${opts.shell}; exec "$0" "$1"`, process.execPath, script]
      : [process.execPath, script];
    const parent = Bun.spawn(argv, {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    });
    await until(() => existsSync(join(dir, "ready")), 10_000);
    const child = await pidFrom(join(dir, "child.pid"));
    const bg = await pidFrom(join(dir, "bg.pid"));
    await until(() => running(bg) && (opts.childExits === true || running(child)));
    return { parent, child, bg };
  }

  /** The detached child's group (child plus same-group grandchild). */
  function killGroup(child: number): void {
    try {
      process.kill(-child, "SIGKILL");
    } catch {
      /* gone */
    }
  }

  test("parent exit kills the tracked tree", async () => {
    const { parent, child, bg } = await startParent(
      `setTimeout(() => process.exit(0), 200);`,
    );
    expect(await parent.exited).toBe(0);
    expect(await until(() => !running(child) && !running(bg))).toBe(true);
  });

  test("SIGTERM with no other handler: tree killed, parent dies by SIGTERM", async () => {
    const { parent, child, bg } = await startParent("");
    parent.kill("SIGTERM");
    await parent.exited;
    expect(parent.signalCode).toBe("SIGTERM");
    expect(await until(() => !running(child) && !running(bg))).toBe(true);
  });

  test("SIGHUP with no other handler: tree killed, parent dies by SIGHUP", async () => {
    const { parent, child, bg } = await startParent("");
    parent.kill("SIGHUP");
    await parent.exited;
    expect(parent.signalCode).toBe("SIGHUP");
    expect(await until(() => !running(child) && !running(bg))).toBe(true);
  });

  test("a parent started with SIGHUP ignored (nohup) survives SIGHUP while tracking", async () => {
    const { parent, child, bg } = await startParent("", "", { shell: "trap '' HUP" });
    try {
      parent.kill("SIGHUP");
      await Bun.sleep(300);
      expect(running(parent.pid)).toBe(true);
      expect(running(child) && running(bg)).toBe(true);
      // Still covered by the other hooks: SIGTERM stops the tree, then the parent.
      parent.kill("SIGTERM");
      await parent.exited;
      expect(parent.signalCode).toBe("SIGTERM");
      expect(await until(() => !running(child) && !running(bg))).toBe(true);
    } finally {
      parent.kill("SIGKILL");
      killGroup(child);
    }
  });

  test("a parent started with SIGHUP ignored still ignores it after untracking", async () => {
    const { parent, child } = await startParent("untrack();", "", { shell: "trap '' HUP" });
    try {
      parent.kill("SIGHUP");
      await Bun.sleep(300);
      expect(running(parent.pid)).toBe(true);
      expect(ignoredSignals(readFileSync(`/proc/${parent.pid}/status`, "utf8")).has("SIGHUP")).toBe(true);
    } finally {
      parent.kill("SIGKILL");
      killGroup(child);
    }
  });

  test("parent exit kills what an exited child left in its group (exit snapshot)", async () => {
    const { parent, child, bg } = await startParent(
      `setTimeout(() => process.exit(0), 200);`,
      "",
      { childExits: true },
    );
    expect(running(child)).toBe(false);
    expect(running(bg)).toBe(true);
    expect(await parent.exited).toBe(0);
    expect(await until(() => !running(bg))).toBe(true);
  });

  test("a parent that handles SIGTERM itself keeps its grace; exit still kills", async () => {
    const { parent, child, bg } = await startParent(
      `process.on("SIGTERM", () => setTimeout(() => process.exit(0), 400));`,
    );
    parent.kill("SIGTERM");
    await Bun.sleep(150);
    expect(running(child)).toBe(true); // the parent's own shutdown is in charge
    expect(await parent.exited).toBe(0);
    expect(await until(() => !running(child) && !running(bg))).toBe(true);
  });

  test("a `once` shutdown handler registered first (bridge) is not cut short", async () => {
    const { parent, child, bg } = await startParent(
      "",
      `process.once("SIGINT", () => setTimeout(() => process.exit(0), 400));`,
    );
    parent.kill("SIGINT");
    await Bun.sleep(150);
    expect(running(child)).toBe(true);
    expect(await parent.exited).toBe(0);
    expect(await until(() => !running(child) && !running(bg))).toBe(true);
  });

  test("untrack removes the hooks once no child is tracked", () => {
    // Another file's run may still track a child: then the hooks stay on.
    const others = trackedChildProcesses().length;
    const before = process.listenerCount("SIGTERM");
    const hooked = others === 0 ? before + 1 : before;
    const untrackA = trackChildProcess(2_147_483_000);
    const untrackB = trackChildProcess(2_147_483_001);
    expect(process.listenerCount("SIGTERM")).toBe(hooked);
    expect(trackedChildProcesses()).toContain(2_147_483_000);
    untrackA();
    untrackA();
    expect(trackedChildProcesses()).not.toContain(2_147_483_000);
    expect(process.listenerCount("SIGTERM")).toBe(hooked);
    untrackB();
    expect(trackedChildProcesses()).not.toContain(2_147_483_001);
    expect(process.listenerCount("SIGTERM")).toBe(before);
    expect(trackChildProcess(process.pid)()).toBeUndefined();
  });
});
