/**
 * Stale worktree state cleanup helpers (SESSION-WORKTREE-5 steal).
 * Separated so tests can exercise cleanup without mocking the whole module.
 */

import { existsSync, rmSync } from "node:fs";

export async function branchExists(
  projectWorkingDir: string,
  branchName: string,
): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      ["git", "rev-parse", "--verify", `refs/heads/${branchName}`],
      {
        cwd: projectWorkingDir,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    await new Response(proc.stderr).text();
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

export async function deleteBranch(
  projectWorkingDir: string,
  branchName: string,
): Promise<void> {
  try {
    const proc = Bun.spawn(["git", "branch", "-D", branchName], {
      cwd: projectWorkingDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    await new Response(proc.stderr).text();
    await proc.exited;
  } catch {
    // Non-fatal — creation will report the real error if the branch still blocks.
  }
}

export async function forceRemoveWorktree(
  projectWorkingDir: string,
  worktreeDir: string,
  pruneAfter: (cwd: string) => Promise<void>,
): Promise<void> {
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
    try {
      if (existsSync(worktreeDir)) {
        rmSync(worktreeDir, { recursive: true, force: true });
      }
      await pruneAfter(projectWorkingDir);
    } catch {
      // Non-fatal
    }
  }
  // Always ensure directory is gone even if git remove "succeeded" partially.
  if (existsSync(worktreeDir)) {
    try {
      rmSync(worktreeDir, { recursive: true, force: true });
      await pruneAfter(projectWorkingDir);
    } catch {
      // Non-fatal
    }
  }
}

export async function cleanStaleWorktreeState(
  projectWorkingDir: string,
  worktreeDir: string,
  branchName: string,
  pruneWorktrees: (cwd: string) => Promise<void>,
): Promise<void> {
  await pruneWorktrees(projectWorkingDir);

  if (existsSync(worktreeDir)) {
    await forceRemoveWorktree(projectWorkingDir, worktreeDir, pruneWorktrees);
  }

  if (await branchExists(projectWorkingDir, branchName)) {
    await deleteBranch(projectWorkingDir, branchName);
  }
}
