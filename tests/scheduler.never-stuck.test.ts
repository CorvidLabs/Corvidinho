/**
 * Schedule runs never stay "running" forever (REQ-discord-346 /
 * DISCORD-SCHEDULE-2/4 / SESSION-WORKTREE-3 / CLI-8 / AUTONOMOUS-4):
 * - a run outcome write that throws (SQLITE_BUSY) is retried once, and when it
 *   still fails it is logged and counted failed, never swallowed;
 * - the Discord bridge's stop() records an in-flight schedule run failed,
 *   kills its agent tree and removes its worktree, like the daemon;
 * - bridge start fails runs a crashed process left "running" and removes
 *   their worktrees, but never touches a run a live process still owns, nor
 *   a schedule-run worktree whose run another data dir owns.
 * Fixtures only: temp git repos, temp SQLite files, fake `sh` agent bins and
 * child Bun processes; no Discord, no network, no token.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database as SqliteDatabase, type Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createSpawnAgentClient } from "../src/discord/agent-client.ts";
import { startBridge } from "../src/discord/bridge.ts";
import { createNullGateway } from "../src/discord/gateway.ts";
import { SchedulerService, type ScheduleRunFinished } from "../src/scheduler/service.ts";
import { readProcStart } from "../src/daemon/lock.ts";
import { ScheduleStore, type Schedule } from "../src/scheduler/store.ts";
import { migrateCorvidinhoDb, openCorvidinhoDb, SCHEMA_VERSION } from "../src/store/db.ts";
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

/** `talk/schedule_*` branches and `talk-schedule_*` worktrees of a repo. */
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

/** Point worktrees at a temp base for this test only. */
function useWorktreeBase(dir: string): void {
  const prev = process.env.WORKTREE_BASE_DIR;
  process.env.WORKTREE_BASE_DIR = dir;
  cleanups.push(() => {
    if (prev === undefined) delete process.env.WORKTREE_BASE_DIR;
    else process.env.WORKTREE_BASE_DIR = prev;
  });
}

/** Alive and not a zombie. */
function running(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
}

async function until(cond: () => boolean, ms = 10_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(20);
  }
  return cond();
}

function quietErrors(): string[] {
  const lines: string[] = [];
  const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  cleanups.push(() => spy.mockRestore());
  return lines;
}

function watchUnhandled(): unknown[] {
  const seen: unknown[] = [];
  const on = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", on);
  cleanups.push(() => process.off("unhandledRejection", on));
  return seen;
}

function seedDue(db: Database, name: string, project = "."): Schedule {
  const store = new ScheduleStore({ db });
  const s = store.create({
    name,
    cronExpression: "0 * * * *",
    project,
    prompt: "summarize",
    createdByUserId: "owner",
  });
  db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1_000, s.id]);
  return s;
}

type RunRow = { id: string; status: string; error: string | null; completed_at: number | null };
function runsOf(db: Database, scheduleId: string): RunRow[] {
  return db
    .query("SELECT id, status, error, completed_at FROM schedule_runs WHERE schedule_id = ?")
    .all(scheduleId) as RunRow[];
}

/** A fake agent: records its pid, then works "forever". */
function sleepyAgentBin(dir: string): { bin: string; pidFile: string } {
  const bin = join(dir, "corvidinho");
  const pidFile = join(dir, "run.pid");
  writeFileSync(bin, ["#!/bin/sh", `echo $$ > "${pidFile}"`, "sleep 30", ""].join("\n"), {
    mode: 0o755,
  });
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

describe("run outcome writes that throw (REQ-discord-346)", () => {
  function fileStore(): { db: Database; store: ScheduleStore; s: Schedule } {
    const dir = tempDir("corvidinho-never-stuck-db-");
    const db = openCorvidinhoDb({ path: join(dir, "corvidinho.db") });
    cleanups.push(() => db.close());
    const s = seedDue(db, "Busy finish");
    const store = new ScheduleStore({ db });
    return { db, store, s };
  }

  test("a write that throws once is retried: the run is recorded completed and reported once", async () => {
    const unhandled = watchUnhandled();
    const errors = quietErrors();
    const { db, store, s } = fileStore();
    const real = store.markRunFinished.bind(store);
    let calls = 0;
    store.markRunFinished = (...args: Parameters<ScheduleStore["markRunFinished"]>) => {
      calls += 1;
      if (calls === 1) throw new Error("SQLITE_BUSY: database is locked");
      return real(...args);
    };
    const events: ScheduleRunFinished[] = [];
    const svc = new SchedulerService({
      store,
      agent: { runChat: async () => ({ ok: true, summary: "done", exitCode: 0 }) } as never,
      allowlist: emptyConfig(),
      manual: true,
      useWorktrees: false,
      onRunFinished: (e) => events.push(e),
    });

    expect((await svc.tick()).started).toEqual([s.id]);
    expect(await svc.drain(3_000)).toBe(true);
    await Bun.sleep(10);

    expect(unhandled).toEqual([]);
    expect(calls).toBe(2);
    expect(runsOf(db, s.id).map((r) => r.status)).toEqual(["completed"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ scheduleId: s.id, ok: true });
    expect(errors.some((l) => l.includes("retrying once") && l.includes("SQLITE_BUSY"))).toBe(true);
  });

  test("a write that throws twice is logged loudly and the run counts as failed", async () => {
    const unhandled = watchUnhandled();
    const errors = quietErrors();
    const { store, s } = fileStore();
    store.markRunFinished = () => {
      throw new Error("SQLITE_BUSY: database is locked");
    };
    const events: ScheduleRunFinished[] = [];
    const svc = new SchedulerService({
      store,
      agent: { runChat: async () => ({ ok: true, summary: "done", exitCode: 0 }) } as never,
      allowlist: emptyConfig(),
      manual: true,
      useWorktrees: false,
      onRunFinished: (e) => events.push(e),
    });

    expect((await svc.tick()).started).toEqual([s.id]);
    expect(await svc.drain(3_000)).toBe(true);
    await Bun.sleep(10);

    expect(unhandled).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]?.ok).toBe(false);
    expect(events[0]?.error).toContain("not recorded");
    expect(store.get(s.id)?.consecutiveFailures).toBe(1);
    const loud = errors.find((l) => l.startsWith("[scheduler] run failed:"));
    expect(loud).toContain("could not record");
    expect(loud).toContain("SQLITE_BUSY");
    expect(svc.runningIds()).toEqual([]);
  });
});

describe("bridge stop and start (REQ-discord-346)", () => {
  function bridgeEnv(projectRoot: string): NodeJS.ProcessEnv {
    return {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      // Missing file: never read the operator's allowlist (ALLOW-4).
      CORVIDINHO_ALLOWLIST_FILE: join(projectRoot, "no-allowlist.toml"),
    };
  }

  test("stop records the in-flight schedule run failed, kills its agent and removes its worktree", async () => {
    const root = tempDir("corvidinho-bridge-stop-");
    const project = join(root, "proj");
    initGitRepo(project);
    useWorktreeBase(join(root, "wts"));
    const db = openCorvidinhoDb({ path: join(root, "corvidinho.db") });
    cleanups.push(() => db.close());
    const s = seedDue(db, "Nightly");
    const { bin, pidFile } = sleepyAgentBin(root);

    const result = await startBridge({
      env: bridgeEnv(project),
      projectRoot: project,
      db,
      skipProtocolCheck: true,
      agent: createSpawnAgentClient({ bin, cwd: project }),
      gatewayFactory: async () => createNullGateway(),
      schedulerPollIntervalMs: 20,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pid = await readPid(pidFile);
    cleanups.push(() => killGroup(pid));
    expect(await until(() => scheduleWorktrees(project).length === 1)).toBe(true);

    await result.stop();

    const runs = runsOf(db, s.id);
    expect(runs.map((r) => r.status)).toEqual(["failed"]);
    expect(runs[0]?.error).toContain("interrupted: bridge shutdown");
    expect(await until(() => !running(pid), 3_000)).toBe(true);
    expect(scheduleWorktrees(project)).toEqual([]);
    expect(scheduleBranches(project)).toEqual([]);
  });

  test("start fails a run a killed process left running and removes its worktree; a live process's run is untouched", async () => {
    const root = tempDir("corvidinho-bridge-recover-");
    const project = join(root, "proj");
    initGitRepo(project);
    const base = join(root, "wts");
    useWorktreeBase(base);
    const dbPath = join(root, "corvidinho.db");
    const seedDb = openCorvidinhoDb({ path: dbPath });
    const dead = seedDue(seedDb, "Crashed");
    const live = seedDue(seedDb, "Still running");
    seedDb.close();

    // A child process claims one run, sets up its worktree and "works".
    const script = join(root, "runner.ts");
    writeFileSync(
      script,
      [
        `import { openCorvidinhoDb } from ${JSON.stringify(join(SRC, "store", "db.ts"))};`,
        `import { ScheduleStore } from ${JSON.stringify(join(SRC, "scheduler", "store.ts"))};`,
        `import { SchedulerService } from ${JSON.stringify(join(SRC, "scheduler", "service.ts"))};`,
        `import { emptyConfig } from ${JSON.stringify(join(SRC, "allowlist", "types.ts"))};`,
        "const db = openCorvidinhoDb({ path: process.env.TEST_DB_PATH });",
        "const store = new ScheduleStore({ db });",
        "const listDue = store.listDue.bind(store);",
        "store.listDue = (now) => listDue(now).filter((s) => s.id === process.env.TEST_SCHED_ID);",
        "const svc = new SchedulerService({",
        "  store,",
        "  agent: { runChat: async (o) => { console.log(`CWD ${o.cwd}`); return new Promise(() => {}); } },",
        "  allowlist: emptyConfig(),",
        "  manual: true,",
        "  defaultProjectRoot: process.env.TEST_PROJECT,",
        "});",
        "await svc.tick();",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
    );
    const spawnRunner = async (schedId: string) => {
      const proc = Bun.spawn([process.execPath, script], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          TEST_DB_PATH: dbPath,
          TEST_SCHED_ID: schedId,
          TEST_PROJECT: project,
          WORKTREE_BASE_DIR: base,
        },
      });
      cleanups.push(() => proc.kill("SIGKILL"));
      const reader = proc.stdout.getReader();
      let text = "";
      const deadline = Date.now() + 15_000;
      while (!text.includes("CWD ") && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
      }
      reader.releaseLock();
      const cwd = text.split("CWD ")[1]?.split("\n")[0]?.trim() ?? "";
      expect(existsSync(cwd)).toBe(true);
      return { proc, cwd };
    };
    const crashed = await spawnRunner(dead.id);
    const alive = await spawnRunner(live.id);
    // kill -9: no shutdown code runs, the row stays "running".
    crashed.proc.kill("SIGKILL");
    await crashed.proc.exited;

    const db = openCorvidinhoDb({ path: dbPath });
    cleanups.push(() => db.close());
    expect(runsOf(db, dead.id).map((r) => r.status)).toEqual(["running"]);

    const result = await startBridge({
      env: bridgeEnv(project),
      projectRoot: project,
      db,
      skipProtocolCheck: true,
      agent: { runChat: async ({ sessionId }) => ({ ok: true, sessionId, summary: "", exitCode: 0 }) },
      gatewayFactory: async () => createNullGateway(),
      schedulerPollIntervalMs: 60_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await result.stop();

    const recovered = runsOf(db, dead.id);
    expect(recovered.map((r) => r.status)).toEqual(["failed"]);
    expect(recovered[0]?.error).toBe("interrupted: process restarted");
    expect(recovered[0]?.completed_at).not.toBeNull();
    expect(existsSync(crashed.cwd)).toBe(false);
    // The live process's run and worktree are left alone.
    expect(runsOf(db, live.id).map((r) => r.status)).toEqual(["running"]);
    expect(existsSync(alive.cwd)).toBe(true);
    expect(scheduleWorktrees(project)).toEqual([alive.cwd]);
    expect(scheduleBranches(project)).toHaveLength(1);
    expect(scheduleBranches(project)[0]).toContain(live.id);
  });

  test("start never touches a schedule-run worktree whose run another data dir owns", async () => {
    const root = tempDir("corvidinho-bridge-foreign-");
    const project = join(root, "proj");
    initGitRepo(project);
    useWorktreeBase(join(root, "wts"));
    // Another data dir (a second bridge or daemon) runs a schedule on this repo.
    const otherDb = openCorvidinhoDb({ path: join(root, "other.db") });
    cleanups.push(() => otherDb.close());
    const s = seedDue(otherDb, "Other data dir");
    const otherStore = new ScheduleStore({ db: otherDb });
    const run = otherStore.claimRun(otherStore.get(s.id)!, Date.now());
    const key = `schedule_${s.id}_${run!.id}`;
    const wt = await createWorktree({
      projectWorkingDir: project,
      branchName: `talk/${key}`,
      worktreeId: `talk-${key}`,
    });
    expect(wt.success).toBe(true);
    writeFileSync(join(wt.worktreeDir, "wip.txt"), "not committed yet\n");

    // A bridge on its own data dir, started inside that worktree.
    const db = openCorvidinhoDb({ path: join(root, "corvidinho.db") });
    cleanups.push(() => db.close());
    const result = await startBridge({
      env: bridgeEnv(project),
      projectRoot: wt.worktreeDir,
      db,
      skipProtocolCheck: true,
      agent: { runChat: async ({ sessionId }) => ({ ok: true, sessionId, summary: "", exitCode: 0 }) },
      gatewayFactory: async () => createNullGateway(),
      schedulerPollIntervalMs: 60_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await result.stop();

    expect(existsSync(join(wt.worktreeDir, "wip.txt"))).toBe(true);
    expect(scheduleWorktrees(project)).toEqual([wt.worktreeDir]);
    expect(scheduleBranches(project)).toEqual([`talk/${key}`]);
  });
});

describe("schema v10 schedule_runs.runner (REQ-discord-346)", () => {
  test("a claimed run records its runner; a v9 DB migrates and its old running row counts as gone", () => {
    const db = new SqliteDatabase(":memory:");
    cleanups.push(() => db.close());
    migrateCorvidinhoDb(db);
    const s = seedDue(db, "Runner");
    const store = new ScheduleStore({ db });
    const run = store.claimRun(store.get(s.id)!, Date.now());
    const row = db.query("SELECT runner FROM schedule_runs WHERE id = ?").get(run!.id) as {
      runner: string;
    };
    // `<pid>:<proc start>`, so a recycled pid never passes for this process.
    expect(row.runner).toBe(`${process.pid}:${readProcStart(process.pid)}`);
    // Our own live run is never recovered.
    expect(store.recoverAbandonedRuns()).toEqual([]);

    // Back to v9 (no runner column), with a run a pre-upgrade process left.
    db.exec("ALTER TABLE schedule_runs DROP COLUMN runner");
    db.run("UPDATE schema_meta SET value = '9' WHERE key = 'version'");
    db.run(
      "INSERT INTO schedule_runs (id, schedule_id, status, started_at) VALUES ('srun_legacy0001', ?, 'running', 1)",
      [s.id],
    );
    migrateCorvidinhoDb(db);
    const v = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(v.value).toBe(String(SCHEMA_VERSION));
    expect(SCHEMA_VERSION).toBe(10);
    const recovered = new ScheduleStore({ db }).recoverAbandonedRuns();
    // Both rows have no runner now, so neither can be proven alive.
    expect(recovered.map((r) => r.id).sort()).toEqual([run!.id, "srun_legacy0001"].sort());
    expect(recovered.every((r) => r.error === "interrupted: process restarted")).toBe(true);
  });
});
