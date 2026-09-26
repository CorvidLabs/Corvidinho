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

function readPid(path: string): number {
  return Number(readFileSync(path, "utf8").trim());
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
  await until(() => existsSync(join(dir, "bg.pid")) && existsSync(join(dir, "sess.pid")));
  const bg = readPid(join(dir, "bg.pid"));
  const sess = readPid(join(dir, "sess.pid"));
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
    await until(() => existsSync(join(dir, "bg.pid")));
    const bg = readPid(join(dir, "bg.pid"));
    await until(() => running(bg));
    const seen = signalProcessTree(proc.pid, "SIGTERM");
    await proc.exited;
    await Bun.sleep(50);
    expect(running(bg)).toBe(true); // ignored SIGTERM, orphaned
    killProcessTree(proc.pid, { known: seen });
    expect(await until(() => !running(bg))).toBe(true);
  });
});

describe("tracked children die with their parent", () => {
  /** A bun parent: runs `before`, spawns a tracked detached tree, runs `then`. */
  function parentScript(dir: string, then: string, before = ""): string {
    const path = join(dir, "parent.ts");
    writeFileSync(
      path,
      `import { trackChildProcess } from ${JSON.stringify(MODULE)};
import { writeFileSync } from "node:fs";
${before}
const child = Bun.spawn(["sh", "-c", ${JSON.stringify(
        `sleep 30 & echo $! > "${dir}/bg.pid"; sleep 30`,
      )}], { stdin: "ignore", stdout: "ignore", detached: true });
trackChildProcess(child.pid);
writeFileSync(${JSON.stringify(join(dir, "child.pid"))}, String(child.pid));
${then}
setInterval(() => {}, 1000);
`,
    );
    return path;
  }

  async function startParent(then: string, before = "") {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-procgroup-parent-"));
    const parent = Bun.spawn([process.execPath, parentScript(dir, then, before)], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    });
    await until(() => existsSync(join(dir, "child.pid")) && existsSync(join(dir, "bg.pid")), 5000);
    const child = readPid(join(dir, "child.pid"));
    const bg = readPid(join(dir, "bg.pid"));
    await until(() => running(child) && running(bg));
    return { parent, child, bg };
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
    const before = process.listenerCount("SIGTERM");
    const untrackA = trackChildProcess(2_147_483_000);
    const untrackB = trackChildProcess(2_147_483_001);
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);
    expect(trackedChildProcesses()).toContain(2_147_483_000);
    untrackA();
    untrackA();
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);
    untrackB();
    expect(process.listenerCount("SIGTERM")).toBe(before);
    expect(trackedChildProcesses()).toEqual([]);
    expect(trackChildProcess(process.pid)()).toBeUndefined();
  });
});
