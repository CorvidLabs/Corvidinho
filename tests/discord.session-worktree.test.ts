/**
 * SESSION-WORKTREE session binding + explicit project (REQ-discord-022).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/discord/session-store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { buildSlashCommandBodies } from "../src/discord/slash-commands.ts";
import {
  ensureTalkWorkspace,
  parkWorktree,
  resolveProjectDir,
} from "../src/worktree/index.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { emptyConfig } from "../src/allowlist/types.ts";

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const run = (args: string[]) => {
    const p = Bun.spawnSync(["git", ...args], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (p.exitCode !== 0) {
      throw new Error(
        `git ${args.join(" ")} failed: ${new TextDecoder().decode(p.stderr)}`,
      );
    }
  };
  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  run(["add", "."]);
  run(["commit", "-m", "init"]);
  const branch = Bun.spawnSync(["git", "branch", "--show-current"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const name = new TextDecoder().decode(branch.stdout).trim();
  if (name && name !== "main") {
    run(["branch", "-M", "main"]);
  }
}

describe("session worktree binding (SESSION-WORKTREE-1..4)", () => {
  test("createWithWorktree binds isolated cwd; continue refuses project switch", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-sess-wt-"));
    try {
      const projectA = join(root, "proj-a");
      const projectB = join(root, "proj-b");
      initGitRepo(projectA);
      initGitRepo(projectB);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const db = openCorvidinhoDb({ memory: true });
      const store = new SessionStore({
        db,
        ttlMs: 45 * 60 * 1000,
        defaultProjectRoot: projectA,
      });

      const created = await store.createWithWorktree({
        channelId: "chan",
        userId: "u1",
        topic: "do stuff",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.session.project).toBe(projectA);
      expect(created.session.worktreePath).toBeTruthy();
      expect(created.session.worktreeState).toBe("active");
      expect(store.cwdFor(created.session)).toBe(created.session.worktreePath);
      expect(existsSync(created.session.worktreePath!)).toBe(true);

      // Explicit different project mid-talk refused
      const switched = await store.bindWorktree(created.session, {
        project: projectB,
      });
      expect(switched.ok).toBe(false);

      // Same project re-bind ok
      const same = await store.bindWorktree(created.session, {
        project: projectA,
      });
      expect(same.ok).toBe(true);

      const pathBefore = created.session.worktreePath!;
      await store.endSession(created.session);
      expect(store.get(created.session.id)).toBeUndefined();
      expect(existsSync(pathBefore)).toBe(false);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("explicit project on create freezes that project", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-sess-proj-"));
    try {
      const def = join(root, "default");
      const other = join(root, "other");
      initGitRepo(def);
      initGitRepo(other);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const store = new SessionStore({
        db: openCorvidinhoDb({ memory: true }),
        defaultProjectRoot: def,
      });
      const created = await store.createWithWorktree({
        channelId: "c",
        userId: "u",
        project: other,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.session.project).toBe(other);
      expect(created.workspace.workDir).toContain(
        join(root, "wts").split("/").pop()!,
      );
      await store.endSession(created.session);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("TTL purge parks worktree", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-sess-ttl-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      let now = 1_000_000;
      const ttlMs = 45 * 60 * 1000;
      const store = new SessionStore({
        db: openCorvidinhoDb({ memory: true }),
        ttlMs,
        now: () => now,
        defaultProjectRoot: project,
      });
      const created = await store.createWithWorktree({
        channelId: "c",
        userId: "u",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const wt = created.session.worktreePath!;
      expect(existsSync(wt)).toBe(true);

      now += ttlMs + 1000;
      expect(store.get(created.session.id)).toBeUndefined();
      // Allow async park to finish
      await Bun.sleep(50);
      expect(existsSync(wt)).toBe(false);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("slash bodies expose optional project on session start and work", () => {
    const bodies = buildSlashCommandBodies();
    const session = bodies.find((b) => b.name === "session");
    const start = session?.options?.find((o) => o.name === "start");
    const startOpts = start?.options?.map((o) => o.name) ?? [];
    expect(startOpts).toContain("topic");
    expect(startOpts).toContain("project");

    const work = bodies.find((b) => b.name === "work");
    const workOpts = work?.options?.map((o) => o.name) ?? [];
    expect(workOpts).toContain("description");
    expect(workOpts).toContain("project");
    // Still eight top-level commands
    expect(bodies.map((b) => b.name).sort()).toEqual(
      ["agents", "announce", "mute", "schedule", "session", "status", "unmute", "work"].sort(),
    );
  });
});

describe("schedule tick uses project worktree (SESSION-WORKTREE + DISCORD-SCHEDULE)", () => {
  test("tick spawns with cwd under schedule project worktree then parks", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-sched-wt-"));
    try {
      const project = join(root, "sched-proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const store = new ScheduleStore();
      const cwds: string[] = [];
      const agent = {
        runChat: async (opts: { cwd?: string }) => {
          if (opts.cwd) cwds.push(opts.cwd);
          return { ok: true as const, sessionId: "s", summary: "ok", exitCode: 0 };
        },
      };

      const past = Date.now() - 60_000;
      const s = store.create({
        name: "WT schedule",
        cronExpression: "0 * * * *",
        project,
        prompt: "do",
        createdByUserId: "admin",
        channelId: "chan-allowed",
        now: past - 3_600_000,
      });
      s.nextRunAt = past;

      const cfg = emptyConfig();
      cfg.discord.channels = ["chan-allowed"];
      const svc = new SchedulerService({
        store,
        agent: agent as never,
        allowlist: cfg,
        manual: true,
        defaultProjectRoot: root,
        useWorktrees: true,
      });

      const tick = await svc.tick();
      expect(tick.started).toContain(s.id);
      await Bun.sleep(100);
      expect(cwds.length).toBe(1);
      expect(cwds[0]).toContain(join(root, "wts"));
      // After run, worktree parked (dir gone)
      expect(existsSync(cwds[0]!)).toBe(false);
      svc.stop();
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
