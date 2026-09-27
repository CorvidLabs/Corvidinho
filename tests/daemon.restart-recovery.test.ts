/**
 * `corvidinho daemon` never leaves a schedule run "running" or its worktree
 * behind (REQ-cli-108 / CLI-8 / AUTONOMOUS-4 / SESSION-WORKTREE-3):
 * - a stop that abandons a run waits a short bounded grace for it to remove
 *   its worktree and empty `talk/schedule_*` branch (a branch with commits is
 *   kept);
 * - a start after a `kill -9` fails the run the dead daemon left "running"
 *   (`interrupted: process restarted`) and removes its worktree;
 * - a start removes the worktree of a run already recorded as ended;
 * - a start never touches a schedule-run worktree whose run its data dir does
 *   not know (another data dir's live run, e.g. `bun test` run inside it).
 * Fixtures only: temp git repos and data dirs, fake `sh` agent bins, one
 * child Bun daemon; no Discord, no network, no token.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDaemonLogger, startDaemon, type DaemonLogger } from "../src/daemon/index.ts";
import { createSpawnAgentClient } from "../src/discord/agent-client.ts";
import { ScheduleStore, type Schedule } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createWorktree } from "../src/worktree/index.ts";

const SRC = join(import.meta.dir, "..", "src");
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

function git(cwd: string, args: string[]): string {
  const p = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${new TextDecoder().decode(p.stderr)}`);
  }
  return new TextDecoder().decode(p.stdout).trim();
}

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "init"]);
}

function scheduleBranches(project: string): string[] {
  const out = git(project, ["branch", "--list", "talk/schedule_*", "--format=%(refname:short)"]);
  return out ? out.split("\n") : [];
}
function scheduleWorktrees(project: string): string[] {
  return git(project, ["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((l) => l.startsWith("worktree ") && l.includes("talk-schedule_"))
    .map((l) => l.slice("worktree ".length));
}

function useWorktreeBase(dir: string): void {
  const prev = process.env.WORKTREE_BASE_DIR;
  process.env.WORKTREE_BASE_DIR = dir;
  cleanups.push(() => {
    if (prev === undefined) delete process.env.WORKTREE_BASE_DIR;
    else process.env.WORKTREE_BASE_DIR = prev;
  });
}

async function until(cond: () => boolean, ms = 10_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(20);
  }
  return cond();
}

function memoryLogger(): { log: DaemonLogger; lines: Array<Record<string, unknown>> } {
  const lines: Array<Record<string, unknown>> = [];
  return { lines, log: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }) };
}

function seedDue(db: Database, name: string): Schedule {
  const store = new ScheduleStore({ db });
  const s = store.create({
    name,
    cronExpression: "0 * * * *",
    project: ".",
    prompt: "summarize",
    createdByUserId: "owner",
  });
  db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1_000, s.id]);
  return s;
}

type RunRow = { id: string; status: string; error: string | null };
function runsOf(db: Database, scheduleId: string): RunRow[] {
  return db
    .query("SELECT id, status, error FROM schedule_runs WHERE schedule_id = ?")
    .all(scheduleId) as RunRow[];
}

/** Fake agent: records its pid, optionally commits in its worktree, then sleeps. */
function agentBin(dir: string, opts: { commit?: boolean } = {}): { bin: string; pidFile: string } {
  const bin = join(dir, "corvidinho");
  const pidFile = join(dir, "run.pid");
  const lines = ["#!/bin/sh"];
  if (opts.commit) {
    lines.push(
      "echo work > agent.txt",
      "git add agent.txt",
      "git -c user.email=a@example.com -c user.name=Agent commit -qm 'agent work'",
    );
  }
  lines.push(`echo $$ > "${pidFile}"`, "sleep 30", "");
  writeFileSync(bin, lines.join("\n"), { mode: 0o755 });
  return { bin, pidFile };
}

async function readPid(pidFile: string): Promise<number> {
  expect(await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() !== "")).toBe(
    true,
  );
  return Number(readFileSync(pidFile, "utf8").trim());
}

function killGroup(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // already gone
  }
}

function fixture(prefix: string) {
  const root = tempDir(prefix);
  const project = join(root, "proj");
  initGitRepo(project);
  useWorktreeBase(join(root, "wts"));
  const dataDir = join(root, "data");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CORVIDINHO_DATA_DIR: dataDir,
    CORVIDINHO_ALLOWLIST_FILE: join(root, "no-allowlist.toml"),
    WORKTREE_BASE_DIR: join(root, "wts"),
  };
  return { root, project, dataDir, env };
}

describe("daemon stop parks an abandoned run's worktree (REQ-cli-108)", () => {
  test("stop after the grace removes the abandoned run's worktree and empty branch", async () => {
    const { root, project, env } = fixture("corvidinho-daemon-park-");
    const db = openCorvidinhoDb({ env });
    cleanups.push(() => db.close());
    const s = seedDue(db, "Slow");
    const { bin, pidFile } = agentBin(root);
    const d = await startDaemon({
      env,
      projectRoot: project,
      logger: memoryLogger().log,
      agent: createSpawnAgentClient({ bin, cwd: project }),
      shutdownGraceMs: 100,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect((await d.tick()).started).toEqual([s.id]);
    const pid = await readPid(pidFile);
    cleanups.push(() => killGroup(pid));
    expect(scheduleWorktrees(project)).toHaveLength(1);
    expect(scheduleBranches(project)).toHaveLength(1);

    const summary = await d.stop("SIGTERM");
    expect(summary.abandoned).toEqual([s.id]);
    expect(runsOf(db, s.id).map((r) => r.status)).toEqual(["failed"]);
    // Parked before stop() resolved (the CLI exits right after).
    expect(scheduleWorktrees(project)).toEqual([]);
    expect(scheduleBranches(project)).toEqual([]);
  });

  test("an abandoned run's branch with commits is kept, never force-deleted", async () => {
    const { root, project, env } = fixture("corvidinho-daemon-keep-");
    const db = openCorvidinhoDb({ env });
    cleanups.push(() => db.close());
    const s = seedDue(db, "Committer");
    const { bin, pidFile } = agentBin(root, { commit: true });
    const d = await startDaemon({
      env,
      projectRoot: project,
      logger: memoryLogger().log,
      agent: createSpawnAgentClient({ bin, cwd: project }),
      shutdownGraceMs: 100,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect((await d.tick()).started).toEqual([s.id]);
    const pid = await readPid(pidFile);
    cleanups.push(() => killGroup(pid));

    await d.stop("SIGTERM");
    expect(scheduleWorktrees(project)).toEqual([]);
    const branches = scheduleBranches(project);
    expect(branches).toHaveLength(1);
    expect(git(project, ["log", "-1", "--format=%s", branches[0]!])).toBe("agent work");
  });
});

describe("daemon start recovers what a dead process left (REQ-cli-108)", () => {
  test("after kill -9 mid-run, the next start fails the run and removes its worktree", async () => {
    const { root, project, dataDir, env } = fixture("corvidinho-daemon-kill9-");
    const seed = openCorvidinhoDb({ env });
    const s = seedDue(seed, "Crashed");
    seed.close();
    const { bin, pidFile } = agentBin(root);
    const script = join(root, "daemon.ts");
    writeFileSync(
      script,
      [
        `import { startDaemon } from ${JSON.stringify(join(SRC, "daemon", "index.ts"))};`,
        `import { createSpawnAgentClient } from ${JSON.stringify(join(SRC, "discord", "agent-client.ts"))};`,
        "const d = await startDaemon({",
        "  projectRoot: process.env.TEST_PROJECT,",
        "  pollIntervalMs: 3_600_000,",
        "  logger: () => {},",
        "  agent: createSpawnAgentClient({ bin: process.env.TEST_BIN, cwd: process.env.TEST_PROJECT }),",
        "});",
        "if (!d.ok) process.exit(3);",
        "await d.tick();",
        "",
      ].join("\n"),
    );
    const child = Bun.spawn([process.execPath, script], {
      cwd: root,
      stdout: "ignore",
      stderr: "ignore",
      env: { ...env, TEST_PROJECT: project, TEST_BIN: bin },
    });
    cleanups.push(() => child.kill("SIGKILL"));
    const agentPid = await readPid(pidFile);
    cleanups.push(() => killGroup(agentPid));
    expect(await until(() => scheduleWorktrees(project).length === 1)).toBe(true);

    child.kill("SIGKILL");
    await child.exited;
    // The agent runs in its own process group and outlives a kill -9.
    killGroup(agentPid);
    expect(existsSync(join(dataDir, "daemon.lock"))).toBe(true);

    const { log, lines } = memoryLogger();
    const d = await startDaemon({
      env,
      projectRoot: project,
      logger: log,
      agent: { runChat: async ({ sessionId }) => ({ ok: true, sessionId, summary: "", exitCode: 0 }) },
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const db = openCorvidinhoDb({ env });
    cleanups.push(() => db.close());
    const runs = runsOf(db, s.id);
    expect(runs.map((r) => r.status)).toEqual(["failed"]);
    expect(runs[0]?.error).toBe("interrupted: process restarted");
    expect(scheduleWorktrees(project)).toEqual([]);
    expect(scheduleBranches(project)).toEqual([]);
    expect(lines.find((l) => l.event === "daemon.recovered")).toMatchObject({
      runs: [runs[0]?.id],
      worktrees: 1,
    });
    await d.stop();
  });

  test("a leftover worktree of a run already recorded failed is removed at start", async () => {
    const { project, env } = fixture("corvidinho-daemon-leftover-");
    const db = openCorvidinhoDb({ env });
    cleanups.push(() => db.close());
    const s = seedDue(db, "Abandoned earlier");
    const store = new ScheduleStore({ db });
    const run = store.claimRun(store.get(s.id)!, Date.now());
    expect(run).not.toBeNull();
    store.markRunFinished(store.get(s.id)!, run!, {
      ok: false,
      error: "interrupted: daemon shutdown (SIGTERM)",
    });
    // Same names the scheduler gives a run's worktree and branch.
    const key = `schedule_${s.id}_${run!.id}`;
    const wt = await createWorktree({
      projectWorkingDir: project,
      branchName: `talk/${key}`,
      worktreeId: `talk-${key}`,
    });
    expect(wt.success).toBe(true);
    // A worktree that is not a schedule run's is never touched.
    const other = await createWorktree({
      projectWorkingDir: project,
      branchName: "talk/someone-else",
      worktreeId: "talk-someone-else",
    });
    expect(other.success).toBe(true);

    const d = await startDaemon({
      env,
      projectRoot: project,
      logger: memoryLogger().log,
      agent: { runChat: async ({ sessionId }) => ({ ok: true, sessionId, summary: "", exitCode: 0 }) },
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(existsSync(wt.worktreeDir)).toBe(false);
    expect(scheduleBranches(project)).toEqual([]);
    expect(existsSync(other.worktreeDir)).toBe(true);
    expect(git(project, ["branch", "--list", "talk/someone-else"])).not.toBe("");
    await d.stop();
  });

  test("a schedule-run worktree another data dir owns is never touched, even when started inside it", async () => {
    const { root, project, env } = fixture("corvidinho-daemon-foreign-");
    // Another bridge/daemon (its own data dir) runs a schedule on this repo.
    const otherDb = openCorvidinhoDb({ env: { ...env, CORVIDINHO_DATA_DIR: join(root, "other-data") } });
    cleanups.push(() => otherDb.close());
    const s = seedDue(otherDb, "Other data dir");
    const otherStore = new ScheduleStore({ db: otherDb });
    const run = otherStore.claimRun(otherStore.get(s.id)!, Date.now());
    expect(run).not.toBeNull();
    const key = `schedule_${s.id}_${run!.id}`;
    const wt = await createWorktree({
      projectWorkingDir: project,
      branchName: `talk/${key}`,
      worktreeId: `talk-${key}`,
    });
    expect(wt.success).toBe(true);
    // Its agent's uncommitted work.
    writeFileSync(join(wt.worktreeDir, "wip.txt"), "not committed yet\n");

    // A daemon on a fresh data dir started with that worktree as its project
    // root (what `bun test` / the verify lane inside the run does).
    const d = await startDaemon({
      env,
      projectRoot: wt.worktreeDir,
      logger: memoryLogger().log,
      agent: { runChat: async ({ sessionId }) => ({ ok: true, sessionId, summary: "", exitCode: 0 }) },
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    await d.stop();
    expect(existsSync(join(wt.worktreeDir, "wip.txt"))).toBe(true);
    expect(scheduleWorktrees(project)).toEqual([wt.worktreeDir]);
    expect(scheduleBranches(project)).toEqual([`talk/${key}`]);
  });
});
