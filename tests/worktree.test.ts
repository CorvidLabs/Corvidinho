/**
 * SESSION-WORKTREE worktree manager fixtures (REQ-discord-022).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorktree,
  ensureTalkWorkspace,
  generateTalkBranchName,
  getWorktreeBaseDir,
  parkWorktree,
  removeWorktree,
  resolveProjectDir,
} from "../src/worktree/index.ts";

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
  // Ensure main exists (some git use master)
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

describe("worktree manager (SESSION-WORKTREE-1/3/5)", () => {
  test("two sessions get distinct worktree dirs and branches", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-wt-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const a = await ensureTalkWorkspace({
        projectWorkingDir: project,
        sessionId: "sess_aaa111",
      });
      const b = await ensureTalkWorkspace({
        projectWorkingDir: project,
        sessionId: "sess_bbb222",
      });
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.workspace.workDir).not.toBe(b.workspace.workDir);
      expect(a.workspace.branchName).not.toBe(b.workspace.branchName);
      expect(existsSync(a.workspace.workDir)).toBe(true);
      expect(existsSync(b.workspace.workDir)).toBe(true);

      // Isolation: write in A does not appear in B
      writeFileSync(join(a.workspace.workDir, "only-a.txt"), "a");
      expect(existsSync(join(a.workspace.workDir, "only-a.txt"))).toBe(true);
      expect(existsSync(join(b.workspace.workDir, "only-a.txt"))).toBe(false);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("park/remove clears active cwd so it is not silently reused", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-wt-park-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const created = await createWorktree({
        projectWorkingDir: project,
        branchName: "talk/parkme",
        worktreeId: "talk-parkme",
      });
      expect(created.success).toBe(true);
      const dir = created.worktreeDir;
      expect(existsSync(dir)).toBe(true);

      const state = await parkWorktree(project, dir, {
        kind: "worktree",
        branchName: "talk/parkme",
      });
      expect(["parked", "removed"]).toContain(state);
      expect(existsSync(dir)).toBe(false);

      // Same id can be recreated fresh (no silent leftover)
      const again = await createWorktree({
        projectWorkingDir: project,
        branchName: "talk/parkme2",
        worktreeId: "talk-parkme",
      });
      expect(again.success).toBe(true);
      expect(existsSync(again.worktreeDir)).toBe(true);
      await removeWorktree(project, again.worktreeDir, { cleanBranch: true });
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("non-git project gets scoped dir under worktree base", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-wt-scoped-"));
    try {
      const project = join(root, "plain");
      mkdirSync(project, { recursive: true });
      writeFileSync(join(project, "notes.txt"), "hi");
      process.env.WORKTREE_BASE_DIR = join(root, "wts");

      const ensured = await ensureTalkWorkspace({
        projectWorkingDir: project,
        sessionId: "sess_scoped1",
      });
      expect(ensured.ok).toBe(true);
      if (!ensured.ok) return;
      expect(ensured.workspace.kind).toBe("scoped_dir");
      expect(existsSync(ensured.workspace.workDir)).toBe(true);

      await parkWorktree(project, ensured.workspace.workDir, {
        kind: "scoped_dir",
      });
      expect(existsSync(ensured.workspace.workDir)).toBe(false);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolveProjectDir default + explicit; generateTalkBranchName", () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-wt-res-"));
    try {
      const project = join(root, "MyProj");
      mkdirSync(project, { recursive: true });
      const def = resolveProjectDir(undefined, { defaultProjectRoot: project });
      expect(def.ok).toBe(true);
      if (def.ok) expect(def.dir).toBe(project);

      const abs = resolveProjectDir(project, { defaultProjectRoot: root });
      expect(abs.ok).toBe(true);

      const missing = resolveProjectDir("nope-missing", {
        defaultProjectRoot: project,
      });
      expect(missing.ok).toBe(false);

      expect(generateTalkBranchName("sess_abcdef0123456789")).toStartWith(
        "talk/",
      );
      expect(getWorktreeBaseDir(project)).toContain(".corvid-worktrees");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
