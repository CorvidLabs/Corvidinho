/**
 * Schedule runs get unique worktrees/branches, and stale-branch cleanup never
 * drops commits (REQ-discord-203 / SESSION-WORKTREE-1/3 / DISCORD-SCHEDULE-3).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import { ScheduleStore, type Schedule } from "../src/scheduler/store.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { createWorktree, removeWorktree } from "../src/worktree/index.ts";

function git(cwd: string, args: string[]): string {
  const p = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${new TextDecoder().decode(p.stderr)}`);
  }
  return new TextDecoder().decode(p.stdout).trim();
}

/**
 * A checkout nested in the bridge root: a schedule may use it only when its
 * origin is on the GitHub allowlist (DISCORD-SCHEDULE-3.a), so it gets an
 * allowlisted one.
 */
function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init"]);
  git(dir, ["remote", "add", "origin", "https://github.com/CorvidLabs/proj.git"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  if (git(dir, ["branch", "--show-current"]) !== "main") {
    git(dir, ["branch", "-M", "main"]);
  }
}

function commitSubjects(project: string): string[] {
  return git(project, ["log", "--all", "--format=%s"]).split("\n");
}

function svcFor(store: ScheduleStore, agent: unknown, root: string, maxConcurrent = 2) {
  const cfg = emptyConfig();
  cfg.discord.channels = ["chan-allowed"];
  cfg.github.orgs = ["corvidlabs"];
  return new SchedulerService({
    store,
    agent: agent as never,
    allowlist: cfg,
    manual: true,
    maxConcurrent,
    defaultProjectRoot: root,
    useWorktrees: true,
  });
}

function makeSchedule(store: ScheduleStore, project: string, name: string): Schedule {
  return store.create({
    name,
    cronExpression: "0 * * * *",
    project,
    prompt: "do",
    createdByUserId: "admin",
    channelId: "chan-allowed",
    now: Date.now() + 3_600_000,
  });
}

async function waitFor(cond: () => boolean, ms = 5000): Promise<void> {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error("timed out waiting");
    await Bun.sleep(10);
  }
}

describe("schedule run worktrees (REQ-discord-203)", () => {
  test("each run gets its own branch; a parked run's commits survive the next run", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-sched-runs-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const store = new ScheduleStore();
      const cwds: string[] = [];
      const branches: string[] = [];
      const agent = {
        runChat: async (opts: { cwd?: string }) => {
          const cwd = opts.cwd!;
          cwds.push(cwd);
          branches.push(git(cwd, ["branch", "--show-current"]));
          if (cwds.length === 1) {
            writeFileSync(join(cwd, "run1.txt"), "work\n");
            git(cwd, ["add", "run1.txt"]);
            git(cwd, ["commit", "-m", "run1 work"]);
          }
          return { ok: true as const, summary: "ok", exitCode: 0 };
        },
      };
      const s = makeSchedule(store, project, "Nightly");
      const svc = svcFor(store, agent, root);

      s.nextRunAt = Date.now() - 1000;
      expect((await svc.tick()).started).toContain(s.id);
      expect(await svc.drain(5000)).toBe(true);
      expect(commitSubjects(project)).toContain("run1 work");

      s.nextRunAt = Date.now() - 1000;
      expect((await svc.tick()).started).toContain(s.id);
      expect(await svc.drain(5000)).toBe(true);

      expect(cwds).toHaveLength(2);
      // Run 1's commits were not destroyed by run 2's worktree setup.
      expect(commitSubjects(project)).toContain("run1 work");
      expect(branches[0]).not.toBe(branches[1]);
      expect(cwds[0]).not.toBe(cwds[1]);
      svc.stop();
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("concurrent schedules with a shared id prefix never share a worktree", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-sched-pair-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const store = new ScheduleStore();
      // 17 ids guarantee two share the first hex char after `sched_`.
      const byFirst = new Map<string, Schedule>();
      let pair: [Schedule, Schedule] | undefined;
      for (let i = 0; i < 17 && !pair; i++) {
        const s = makeSchedule(store, project, `S${i}`);
        const prev = byFirst.get(s.id.charAt(6));
        if (prev) pair = [prev, s];
        else byFirst.set(s.id.charAt(6), s);
      }
      if (!pair) throw new Error("no shared-prefix pair");
      const [a, b] = pair;
      for (const s of store.list()) {
        if (s.id !== a.id && s.id !== b.id) store.delete(s.id);
      }

      const cwdById = new Map<string, string>();
      let releaseA!: () => void;
      const gateA = new Promise<void>((r) => {
        releaseA = r;
      });
      const agent = {
        runChat: async (opts: { cwd?: string; sessionId?: string }) => {
          const cwd = opts.cwd!;
          if (opts.sessionId === `schedule_${a.id}`) {
            writeFileSync(join(cwd, "wip.txt"), "uncommitted\n");
            cwdById.set(a.id, cwd);
            await gateA;
          } else {
            cwdById.set(b.id, cwd);
          }
          return { ok: true as const, summary: "ok", exitCode: 0 };
        },
      };
      const svc = svcFor(store, agent, root, 2);

      a.nextRunAt = Date.now() - 1000;
      expect((await svc.tick()).started).toEqual([a.id]);
      await waitFor(() => cwdById.has(a.id));

      b.nextRunAt = Date.now() - 1000;
      expect((await svc.tick()).started).toEqual([b.id]);
      await waitFor(() => cwdById.has(b.id));

      const aDir = cwdById.get(a.id)!;
      expect(cwdById.get(b.id)).not.toBe(aDir);
      // A's live working tree (uncommitted edits) survived B's setup.
      expect(existsSync(join(aDir, "wip.txt"))).toBe(true);

      releaseA();
      expect(await svc.drain(5000)).toBe(true);
      svc.stop();
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("stale branch with commits ahead of HEAD is parked, not deleted", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-wt-stale-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const first = await createWorktree({
        projectWorkingDir: project,
        branchName: "talk/keepme",
        worktreeId: "talk-keepme",
      });
      expect(first.success).toBe(true);
      writeFileSync(join(first.worktreeDir, "k.txt"), "k\n");
      git(first.worktreeDir, ["add", "k.txt"]);
      git(first.worktreeDir, ["commit", "-m", "keep me"]);
      const kept = git(project, ["rev-parse", "refs/heads/talk/keepme"]);
      // Park keeps the branch because it has commits.
      await removeWorktree(project, first.worktreeDir, { cleanBranch: true });

      const again = await createWorktree({
        projectWorkingDir: project,
        branchName: "talk/keepme",
        worktreeId: "talk-keepme",
      });
      expect(again.success).toBe(true);
      expect(commitSubjects(project)).toContain("keep me");
      const parked = git(project, ["branch", "--list", "talk/keepme-parked-*", "--format=%(objectname)"]);
      expect(parked.split("\n")).toContain(kept);
      await removeWorktree(project, again.worktreeDir, { cleanBranch: true });

      // A stale branch with no commits of its own is still just deleted.
      git(project, ["branch", "talk/empty"]);
      const empty = await createWorktree({
        projectWorkingDir: project,
        branchName: "talk/empty",
        worktreeId: "talk-empty",
      });
      expect(empty.success).toBe(true);
      expect(git(project, ["branch", "--list", "talk/empty-parked-*"])).toBe("");
      await removeWorktree(project, empty.worktreeDir, { cleanBranch: true });
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
