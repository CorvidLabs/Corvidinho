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
  talkWorktreeId,
} from "../src/worktree/index.ts";

function gitOut(dir: string, args: string[]): string {
  const p = Bun.spawnSync(["git", ...args], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  return new TextDecoder().decode(p.stdout).trim();
}

function initGitRepo(dir: string, defaultBranch = "main"): void {
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
  // Ensure the default branch has the wanted name (some git use master)
  const branch = Bun.spawnSync(["git", "branch", "--show-current"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const name = new TextDecoder().decode(branch.stdout).trim();
  if (name && name !== defaultBranch) {
    run(["branch", "-M", defaultBranch]);
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

  test("ids sharing a 16-char prefix get distinct default worktrees; B's setup leaves A's live worktree alone", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-wt-prefix-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");
      // Scheduler-shaped ids: both start with `schedule_sched_a`.
      const idA = "schedule_sched_a1111111_run_aaaa";
      const idB = "schedule_sched_a2222222_run_bbbb";
      expect(talkWorktreeId(idA)).not.toBe(talkWorktreeId(idB));
      expect(generateTalkBranchName(idA)).not.toBe(generateTalkBranchName(idB));
      // Deterministic: the same id always maps to the same names.
      expect(talkWorktreeId(idA)).toBe(talkWorktreeId(idA));
      expect(generateTalkBranchName(idA)).toBe(generateTalkBranchName(idA));

      const a = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: idA });
      expect(a.ok).toBe(true);
      if (!a.ok) return;
      writeFileSync(join(a.workspace.workDir, "a-wip.txt"), "wip");

      const b = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: idB });
      expect(b.ok).toBe(true);
      if (!b.ok) return;
      expect(b.workspace.workDir).not.toBe(a.workspace.workDir);
      expect(b.workspace.branchName).not.toBe(a.workspace.branchName);
      // A's live working tree and uncommitted edit survive B's setup.
      expect(existsSync(join(a.workspace.workDir, "a-wip.txt"))).toBe(true);
      expect(gitOut(a.workspace.workDir, ["branch", "--show-current"])).toBe(
        a.workspace.branchName ?? "",
      );

      // Non-git project: scoped dirs are distinct too.
      const plain = join(root, "plain");
      mkdirSync(plain, { recursive: true });
      const sa = await ensureTalkWorkspace({ projectWorkingDir: plain, sessionId: idA });
      expect(sa.ok).toBe(true);
      if (!sa.ok) return;
      writeFileSync(join(sa.workspace.workDir, "a-note.txt"), "a");
      const sb = await ensureTalkWorkspace({ projectWorkingDir: plain, sessionId: idB });
      expect(sb.ok).toBe(true);
      if (!sb.ok) return;
      expect(sb.workspace.workDir).not.toBe(sa.workspace.workDir);
      expect(existsSync(join(sa.workspace.workDir, "a-note.txt"))).toBe(true);
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

  test("default branch 'trunk': branch with commits survives cleanup, clean branch is deleted", async () => {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-wt-trunk-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project, "trunk");
      process.env.WORKTREE_BASE_DIR = join(root, "wts");
      // No main/master: the old main../master.. check failed open here.
      expect(gitOut(project, ["branch", "--list", "main", "master"])).toBe("");
      expect(gitOut(project, ["branch", "--show-current"])).toBe("trunk");

      // Branch with a commit of its own: must survive remove + park.
      const worked = await createWorktree({
        projectWorkingDir: project,
        branchName: "talk/worked",
        worktreeId: "talk-worked",
      });
      expect(worked.success).toBe(true);
      writeFileSync(join(worked.worktreeDir, "work.txt"), "run output\n");
      for (const args of [
        ["add", "work.txt"],
        ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "run work"],
      ]) {
        const p = Bun.spawnSync(["git", ...args], {
          cwd: worked.worktreeDir,
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(p.exitCode).toBe(0);
      }
      const workSha = gitOut(worked.worktreeDir, ["rev-parse", "HEAD"]);

      const state = await parkWorktree(project, worked.worktreeDir, {
        kind: "worktree",
        branchName: "talk/worked",
      });
      expect(["parked", "removed"]).toContain(state);
      expect(existsSync(worked.worktreeDir)).toBe(false);
      expect(gitOut(project, ["rev-parse", "--verify", "refs/heads/talk/worked"])).toBe(workSha);

      // Clean branch (no commits off HEAD): still deleted as before.
      const clean = await createWorktree({
        projectWorkingDir: project,
        branchName: "talk/clean",
        worktreeId: "talk-clean",
      });
      expect(clean.success).toBe(true);
      await removeWorktree(project, clean.worktreeDir, { cleanBranch: true });
      expect(existsSync(clean.worktreeDir)).toBe(false);
      expect(gitOut(project, ["branch", "--list", "talk/clean"])).toBe("");
      // The worked branch is still there after the second cleanup.
      expect(gitOut(project, ["rev-parse", "--verify", "refs/heads/talk/worked"])).toBe(workSha);
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
