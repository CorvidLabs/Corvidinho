/**
 * Shared git worktree utilities (SESSION-WORKTREE-1..5).
 * Steal from corvid-agent server/lib/worktree* — Linux headless only.
 */

import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  branchExists,
  branchHasOwnCommits,
  cleanStaleWorktreeState,
  deleteBranch,
  forceRemoveWorktree,
} from "./cleanup.ts";

export type WorktreeState = "active" | "parked" | "removed";

export type CreateWorktreeOptions = {
  projectWorkingDir: string;
  branchName: string;
  worktreeId: string;
};

export type CreateWorktreeResult = {
  success: boolean;
  worktreeDir: string;
  error?: string;
};

export type RemoveWorktreeOptions = {
  /** Delete branch only when it has zero commits off the project HEAD (keep if it has work or git errors). */
  cleanBranch?: boolean;
};

export type EnsureTalkWorkspaceOptions = {
  projectWorkingDir: string;
  sessionId: string;
  /** Override worktree id (default talk-{sessionPrefix}). */
  worktreeId?: string;
  /** Override branch name. */
  branchName?: string;
};

export type TalkWorkspace = {
  kind: "worktree" | "scoped_dir";
  workDir: string;
  projectWorkingDir: string;
  branchName?: string;
  worktreeId: string;
  state: WorktreeState;
};

export type ResolveProjectOptions = {
  /** Bridge default project root when project is empty. */
  defaultProjectRoot: string;
};

/**
 * Base directory for git worktrees.
 * Defaults to `.corvid-worktrees` sibling of the project (WORKTREE_BASE_DIR override).
 */
export function getWorktreeBaseDir(projectWorkingDir: string): string {
  const env = process.env.WORKTREE_BASE_DIR?.trim();
  if (env) return resolve(env);
  return resolve(dirname(projectWorkingDir), ".corvid-worktrees");
}

/** Branch: talk/{sessionId-prefix} */
export function generateTalkBranchName(sessionId: string): string {
  const sessionPrefix = sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
  return `talk/${sessionPrefix || "unknown"}`;
}

export function talkWorktreeId(sessionId: string): string {
  const sessionPrefix = sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
  return `talk-${sessionPrefix || "unknown"}`;
}

/**
 * Resolve a project path or name to an absolute directory.
 * Empty → defaultProjectRoot. Absolute existing dir → as-is.
 * Relative → resolve against defaultProjectRoot's parent (or cwd).
 */
export function resolveProjectDir(
  project: string | undefined | null,
  opts: ResolveProjectOptions,
): { ok: true; dir: string } | { ok: false; error: string } {
  const raw = (project ?? "").trim();
  const fallback = resolve(opts.defaultProjectRoot);
  if (!raw) {
    if (!existsSync(fallback) || !statSync(fallback).isDirectory()) {
      return { ok: false, error: `default project root missing: ${fallback}` };
    }
    return { ok: true, dir: fallback };
  }
  const candidate = isAbsolute(raw)
    ? resolve(raw)
    : resolve(fallback, raw);
  // Also try sibling of default root (common for /workspace/ProjectName).
  const sibling = isAbsolute(raw)
    ? candidate
    : resolve(dirname(fallback), raw);
  for (const dir of [candidate, sibling]) {
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      return { ok: true, dir };
    }
  }
  return {
    ok: false,
    error: `project path not found: ${raw} (tried ${candidate}, ${sibling})`,
  };
}

export function isGitRepo(dir: string): boolean {
  try {
    const proc = Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) return false;
    const out = new TextDecoder().decode(proc.stdout).trim();
    return out === "true";
  } catch {
    return false;
  }
}

export async function pruneWorktrees(projectWorkingDir: string): Promise<void> {
  try {
    const proc = Bun.spawn(["git", "worktree", "prune"], {
      cwd: projectWorkingDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    await new Response(proc.stderr).text();
    await proc.exited;
  } catch {
    // Non-fatal
  }
}

export async function createWorktree(
  options: CreateWorktreeOptions,
): Promise<CreateWorktreeResult> {
  const { projectWorkingDir, branchName, worktreeId } = options;
  const worktreeBase = getWorktreeBaseDir(projectWorkingDir);
  const worktreeDir = resolve(worktreeBase, worktreeId);

  try {
    mkdirSync(worktreeBase, { recursive: true });
    await cleanStaleWorktreeState(
      projectWorkingDir,
      worktreeDir,
      branchName,
      pruneWorktrees,
    );

    const proc = Bun.spawn(
      ["git", "worktree", "add", "-b", branchName, worktreeDir],
      {
        cwd: projectWorkingDir,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        worktreeDir,
        error: `Failed to create worktree: ${stderr.trim()}`,
      };
    }
    return { success: true, worktreeDir };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      worktreeDir,
      error: `Failed to create worktree: ${message}`,
    };
  }
}

async function detectWorktreeBranch(
  projectWorkingDir: string,
  worktreeDir: string,
): Promise<string | undefined> {
  try {
    const proc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
      cwd: projectWorkingDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    const blocks = stdout.split("\n\n");
    for (const block of blocks) {
      if (block.includes(`worktree ${worktreeDir}`)) {
        const branchLine = block.split("\n").find((l) => l.startsWith("branch "));
        if (branchLine) {
          return branchLine.replace("branch refs/heads/", "");
        }
      }
    }
  } catch {
    // Non-fatal
  }
  return undefined;
}

/**
 * Delete a talk branch only when it has no commits off the project HEAD.
 * Any git error counts as "has commits", so a branch is never force-deleted
 * on a guess (e.g. a repo whose default branch is not `main`/`master`).
 */
async function cleanupEmptyBranch(
  projectWorkingDir: string,
  branchName: string,
): Promise<void> {
  try {
    if (await branchHasOwnCommits(projectWorkingDir, branchName)) return;
    await deleteBranch(projectWorkingDir, branchName);
  } catch {
    // Non-fatal — keep the branch.
  }
}

/**
 * Remove a git worktree. Idempotent. With cleanBranch, delete empty branches.
 */
export async function removeWorktree(
  projectWorkingDir: string,
  worktreeDir: string,
  options?: RemoveWorktreeOptions,
): Promise<void> {
  let branchName: string | undefined;
  if (options?.cleanBranch) {
    branchName = await detectWorktreeBranch(projectWorkingDir, worktreeDir);
  }

  try {
    const proc = Bun.spawn(
      ["git", "worktree", "remove", "--force", worktreeDir],
      {
        cwd: projectWorkingDir,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    await new Response(proc.stderr).text();
    await proc.exited;
  } catch {
    // Fall through to manual
  }

  if (existsSync(worktreeDir)) {
    try {
      rmSync(worktreeDir, { recursive: true, force: true });
      await pruneWorktrees(projectWorkingDir);
    } catch {
      // Non-fatal
    }
  }

  if (branchName) {
    await cleanupEmptyBranch(projectWorkingDir, branchName);
  }
}

/**
 * Park a worktree: remove the directory from active use so another talk
 * cannot silently reuse it as cwd. Keep branch when it has commits.
 * For scoped dirs (non-git), rename aside or remove.
 */
export async function parkWorktree(
  projectWorkingDir: string,
  workDir: string,
  opts?: { kind?: "worktree" | "scoped_dir"; branchName?: string },
): Promise<WorktreeState> {
  if (!workDir) return "removed";
  const kind = opts?.kind ?? (isGitRepo(projectWorkingDir) ? "worktree" : "scoped_dir");

  if (kind === "scoped_dir" || !isGitRepo(projectWorkingDir)) {
    if (existsSync(workDir)) {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // If remove fails, try park rename
        try {
          const parked = `${workDir}.parked-${Date.now()}`;
          const { renameSync } = await import("node:fs");
          renameSync(workDir, parked);
          return "parked";
        } catch {
          return "parked";
        }
      }
    }
    return "removed";
  }

  await removeWorktree(projectWorkingDir, workDir, { cleanBranch: true });
  // Directory must not remain as a reusable cwd
  if (existsSync(workDir)) {
    return "parked";
  }
  return "removed";
}

/**
 * Ensure an isolated workspace for a talk/schedule run.
 * Git repo → worktree; otherwise → scoped directory under worktree base.
 */
export async function ensureTalkWorkspace(
  options: EnsureTalkWorkspaceOptions,
): Promise<
  | { ok: true; workspace: TalkWorkspace }
  | { ok: false; error: string }
> {
  const projectWorkingDir = resolve(options.projectWorkingDir);
  if (!existsSync(projectWorkingDir) || !statSync(projectWorkingDir).isDirectory()) {
    return { ok: false, error: `project directory missing: ${projectWorkingDir}` };
  }

  const worktreeId = options.worktreeId ?? talkWorktreeId(options.sessionId);
  const branchName =
    options.branchName ?? generateTalkBranchName(options.sessionId);
  const base = getWorktreeBaseDir(projectWorkingDir);
  mkdirSync(base, { recursive: true });

  if (isGitRepo(projectWorkingDir)) {
    const result = await createWorktree({
      projectWorkingDir,
      branchName,
      worktreeId,
    });
    if (!result.success) {
      return { ok: false, error: result.error ?? "worktree create failed" };
    }
    return {
      ok: true,
      workspace: {
        kind: "worktree",
        workDir: result.worktreeDir,
        projectWorkingDir,
        branchName,
        worktreeId,
        state: "active",
      },
    };
  }

  // Non-git: project-scoped directory (SESSION-WORKTREE-1 allows scoped dir)
  const workDir = resolve(base, `scoped-${worktreeId}`);
  if (existsSync(workDir)) {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      return { ok: false, error: `stale scoped dir blocked: ${workDir}` };
    }
  }
  mkdirSync(workDir, { recursive: true });
  return {
    ok: true,
    workspace: {
      kind: "scoped_dir",
      workDir,
      projectWorkingDir,
      worktreeId,
      state: "active",
    },
  };
}

export {
  branchExists,
  cleanStaleWorktreeState,
  deleteBranch,
  forceRemoveWorktree,
};
