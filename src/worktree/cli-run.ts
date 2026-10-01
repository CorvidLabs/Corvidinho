/**
 * SESSION-WORKTREE-1.a (REQ-cli-122): where a local `corvidinho task run`
 * works.
 *
 * In a git repo the run works in its own linked worktree by default, made by
 * {@link ensureTalkWorkspace} from the repo's top level (realpath of
 * `git rev-parse --show-toplevel`) with its usual defaults: under
 * `WORKTREE_BASE_DIR` or `dirname(repoTop)/.corvid-worktrees`, id
 * `talk-cli_<uuid prefix>-<digest>`, branch `talk/cli_…`, from HEAD only (the
 * checkout's uncommitted and untracked files are not copied and nothing is
 * installed there). The run uses the same subdirectory it was started in.
 *
 * It stays in place when:
 * - `--here` was passed (the user's current checkout);
 * - the directory is not in a git work tree (AGENT-1.a: the project folder
 *   itself);
 * - the process is a child a product surface spawned — a role session
 *   (`CORVIDINHO_ACTING_IS_ADMIN` set: Discord chat, /session, /work,
 *   schedules), a WATCH run, a Discord session, or a delegate / council
 *   worker (delegation depth > 0) — which already runs in the cwd its parent
 *   chose, so it never makes a nested worktree (even from a parent that does
 *   not pass `--here` yet).
 *
 * Creation fails closed: the caller exits 1 with one scrubbed line and the
 * hint {@link CLI_HERE_HINT}; it never falls back to the checkout. A signal
 * during creation gives `cancelled` (exit 130) and removes what was made.
 *
 * When the run ends, {@link finishCliTaskWorkspace} removes the worktree only
 * when `git status --porcelain` shows it clean, and deletes its branch only
 * when the branch has no commits of its own; anything else is kept and
 * reported. Uncommitted work is never force-removed.
 */

import { randomUUID } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { TaskWorkspaceReport } from "../agent/types.ts";
import { delegateDepthFromEnv } from "../autonomous/delegate.ts";
import { roleSessionActive } from "../plugins/roles.ts";
import { branchExists, branchHasOwnCommits, deleteBranch } from "./cleanup.ts";
import {
  ensureTalkWorkspace,
  generateTalkBranchName,
  getWorktreeBaseDir,
  isGitRepo,
  parkWorktree,
  removeWorktree,
  talkWorktreeId,
} from "./manager.ts";

/** The hint on every refusal: the opt-out that runs in the user's checkout. */
export const CLI_HERE_HINT = "pass --here to run in this checkout";

/** Where a local task run works (the result's `workspace`, REQ-cli-122). */
export type CliTaskWorkspace =
  | {
      kind: "here";
      /** The directory the run works in (unchanged). */
      cwd: string;
      /** Why it stays: `--here`, not a git repo, or a spawned child. */
      reason: "here" | "not-git" | "child";
    }
  | {
      kind: "worktree";
      /** The directory the run works in: `dir` plus the start subdirectory. */
      cwd: string;
      /** The linked worktree's top level. */
      dir: string;
      /** Its branch (`talk/cli_…`). */
      branch: string;
      /** Realpath of the repo top level the worktree was made from. */
      repoTop: string;
    };

export type EnterCliTaskWorkspaceResult =
  | { ok: true; workspace: CliTaskWorkspace }
  | { ok: false; error: string; cancelled: boolean };

/**
 * True when this process was spawned by a product surface that already chose
 * its cwd (see the module comment), so it must not make a nested worktree.
 */
export function isSpawnedTaskChild(env: NodeJS.ProcessEnv = process.env): boolean {
  if (roleSessionActive(env)) return true;
  if ((env.CORVIDINHO_WATCH_SESSION_ID ?? "").trim()) return true;
  if ((env.CORVIDINHO_DISCORD_SESSION_ID ?? "").trim()) return true;
  return delegateDepthFromEnv(env) > 0;
}

function gitTop(dir: string): string | null {
  try {
    const proc = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) return null;
    const out = new TextDecoder().decode(proc.stdout).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** True when HEAD names a commit (false for an unborn HEAD or a git error). */
function hasHeadCommit(dir: string): boolean {
  try {
    const proc = Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", "HEAD^{commit}"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * The `fatal:` / `error:` line of a git error, else its last line (a failing
 * checkout hook's own message comes last; git's `Preparing worktree` progress
 * line comes first).
 */
function gitErrorLine(error: string): string {
  const lines = error
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^Failed to create worktree:\s*/, ""))
    .filter(Boolean);
  const fatal = lines.find((l) => /(^|\s)(fatal|error):/.test(l));
  return fatal ?? lines[lines.length - 1] ?? "unknown error";
}

/**
 * Remove a worktree this process just made (nothing in it is the user's):
 * the directory, then the branch when it has no commits of its own.
 */
async function discardNewWorktree(repoTop: string, dir: string, branch: string): Promise<void> {
  try {
    await removeWorktree(repoTop, dir);
  } catch {
    // Non-fatal: the start line / error names the dir.
  }
  try {
    if ((await branchExists(repoTop, branch)) && !(await branchHasOwnCommits(repoTop, branch))) {
      await deleteBranch(repoTop, branch);
    }
  } catch {
    // Keep the branch.
  }
}

/**
 * Choose, and when needed make, the directory a local `task run` works in.
 * `signal` is the run's abort signal: when it fires before or while the
 * worktree is made, the result is `cancelled` and nothing is left behind.
 */
export async function enterCliTaskWorkspace(opts: {
  cwd: string;
  here: boolean;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  /** Tests only: the talk id (default `cli_<random uuid, no dashes>`). */
  sessionId?: string;
}): Promise<EnterCliTaskWorkspaceResult> {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd;
  if (opts.here) return { ok: true, workspace: { kind: "here", cwd, reason: "here" } };
  if (isSpawnedTaskChild(env)) return { ok: true, workspace: { kind: "here", cwd, reason: "child" } };
  if (!isGitRepo(cwd)) return { ok: true, workspace: { kind: "here", cwd, reason: "not-git" } };

  const cancelled = { ok: false as const, error: "cancelled while making the task worktree", cancelled: true };
  if (opts.signal?.aborted) return cancelled;

  const top = gitTop(cwd);
  let repoTop: string;
  let rel: string;
  try {
    if (!top) throw new Error("no top level");
    repoTop = realpathSync(top);
    rel = relative(repoTop, realpathSync(cwd));
  } catch {
    return { ok: false, error: "task run could not find this git repo's top level", cancelled: false };
  }
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    return { ok: false, error: "task run could not place this directory inside its git repo", cancelled: false };
  }

  // No commit yet (unborn HEAD): newer git would make an empty orphan
  // worktree; there is no HEAD to make it from, so refuse.
  if (!hasHeadCommit(repoTop)) {
    return {
      ok: false,
      error: "task run could not make its worktree: this repo has no commit yet (HEAD is unborn)",
      cancelled: false,
    };
  }

  const sessionId = opts.sessionId ?? `cli_${randomUUID().replace(/-/g, "")}`;
  let made;
  try {
    made = await ensureTalkWorkspace({ projectWorkingDir: repoTop, sessionId });
  } catch (err) {
    made = { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
  if (!made.ok) {
    // A failed `git worktree add -b` can still leave what it made: the branch
    // (git makes it before the checkout), and the whole worktree when only a
    // post-checkout hook failed (git-lfs or husky with nothing installed) or
    // the signal came mid-way. Both names come from this run's fresh random
    // talk id, so they are only ever this run's; remove them.
    await discardNewWorktree(
      repoTop,
      resolve(getWorktreeBaseDir(repoTop), talkWorktreeId(sessionId)),
      generateTalkBranchName(sessionId),
    );
    if (opts.signal?.aborted) return cancelled;
    return {
      ok: false,
      error: `task run could not make its worktree: ${gitErrorLine(made.error)}`,
      cancelled: false,
    };
  }
  const ws = made.workspace;
  const branch = ws.branchName ?? "";
  if (ws.kind !== "worktree" || !branch) {
    await parkWorktree(repoTop, ws.workDir, { kind: ws.kind });
    return { ok: false, error: "task run could not make its worktree: not a git worktree", cancelled: false };
  }
  if (opts.signal?.aborted) {
    await discardNewWorktree(repoTop, ws.workDir, branch);
    return cancelled;
  }
  const runCwd = rel ? join(ws.workDir, rel) : ws.workDir;
  let isDir = false;
  try {
    isDir = statSync(runCwd).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    await discardNewWorktree(repoTop, ws.workDir, branch);
    return {
      ok: false,
      error: `task run's worktree has no ${rel}: the worktree is made from HEAD, so an untracked, ignored or uncommitted directory is not in it`,
      cancelled: false,
    };
  }
  return {
    ok: true,
    workspace: { kind: "worktree", cwd: runCwd, dir: ws.workDir, branch, repoTop },
  };
}

/** The start line of a run in its own worktree (text: stderr; json/ndjson: a Text event). */
export function cliWorkspaceStartLine(ws: Extract<CliTaskWorkspace, { kind: "worktree" }>): string {
  return (
    `Working in a new worktree ${ws.dir} (branch ${ws.branch}) made from HEAD: ` +
    "uncommitted and untracked files in this checkout are not included and nothing is installed there. " +
    "Pass --here to run in this checkout."
  );
}

/** True when `git status --porcelain` is empty; null when git cannot say. */
async function porcelainClean(dir: string): Promise<boolean | null> {
  try {
    const proc = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if ((await proc.exited) !== 0) return null;
    return out.trim() === "";
  } catch {
    return null;
  }
}

/** What {@link finishCliTaskWorkspace} did, and the text-mode line saying so. */
export type FinishedCliTaskWorkspace = {
  report: TaskWorkspaceReport;
  /** One stderr line (text mode) naming what was kept; null when nothing was. */
  note: string | null;
};

/** The branch checked out in `dir`; null when HEAD is detached or git cannot say. */
async function checkedOutBranch(dir: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "symbolic-ref", "--quiet", "--short", "HEAD"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if ((await proc.exited) !== 0) return null;
    return out.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Delete the run's talk branch after the run switched its worktree to a
 * branch of its own (`git-branch-create`), when every commit on it is also on
 * the checkout's HEAD or on that branch; any doubt keeps it.
 */
async function dropMovedOffTalkBranch(repoTop: string, talk: string, end: string): Promise<void> {
  try {
    if (!(await branchExists(repoTop, talk))) return;
    const not = ["HEAD"];
    if (await branchExists(repoTop, end)) not.push(`refs/heads/${end}`);
    const proc = Bun.spawn(["git", "rev-list", "--count", `refs/heads/${talk}`, "--not", ...not], {
      cwd: repoTop,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if ((await proc.exited) !== 0 || out.trim() !== "0") return;
    await deleteBranch(repoTop, talk);
  } catch {
    // Keep the branch.
  }
}

/**
 * At the end of a run (done, failed, blocked or cancelled): remove the
 * worktree only when it is clean, and its branch only when the branch has no
 * commits of its own (`parkWorktree`). A dirty worktree, or one git cannot
 * read, is kept with its branch. The branch named is the one the worktree is
 * on at the end: the run's own `talk/cli_…`, or a branch the run made and
 * switched to (then the talk branch goes when nothing is only on it). Never
 * throws.
 */
export async function finishCliTaskWorkspace(
  ws: Extract<CliTaskWorkspace, { kind: "worktree" }>,
): Promise<FinishedCliTaskWorkspace> {
  let branch = ws.branch;
  /** The talk branch, when the run switched off it and it still has commits only on it. */
  const talkAlso = async (): Promise<string> =>
    branch !== ws.branch && (await branchExists(ws.repoTop, ws.branch).catch(() => true))
      ? ` Also kept branch ${ws.branch}: it has commits of its own.`
      : "";
  const kept = async (why: string, branchKept = true): Promise<FinishedCliTaskWorkspace> => ({
    report: { dir: ws.dir, branch, kept: true, branchKept },
    note: `Kept worktree ${ws.dir} (branch ${branch}): ${why}.${await talkAlso()}`,
  });
  try {
    if (existsSync(ws.dir)) {
      branch = (await checkedOutBranch(ws.dir)) ?? ws.branch;
      if (branch !== ws.branch) await dropMovedOffTalkBranch(ws.repoTop, ws.branch, branch);
      const clean = await porcelainClean(ws.dir);
      if (clean === null) return await kept("git could not say whether it is clean");
      if (!clean) return await kept("it has uncommitted changes");
      await parkWorktree(ws.repoTop, ws.dir, { kind: "worktree", branchName: branch });
      if (existsSync(ws.dir)) {
        return await kept("it could not be removed", await branchExists(ws.repoTop, branch));
      }
    }
    // The run's own branch was empty and is gone, but the talk branch it
    // switched off has commits only on it: that is the branch to name.
    if (
      branch !== ws.branch &&
      !(await branchExists(ws.repoTop, branch)) &&
      (await branchExists(ws.repoTop, ws.branch))
    ) {
      branch = ws.branch;
    }
    const branchKept = await branchExists(ws.repoTop, branch);
    return {
      report: { dir: ws.dir, branch, kept: false, branchKept },
      note: branchKept
        ? `Removed worktree ${ws.dir}; kept branch ${branch}: it has commits of its own.${await talkAlso()}`
        : null,
    };
  } catch {
    return {
      report: { dir: ws.dir, branch, kept: true, branchKept: true },
      note: `Kept worktree ${ws.dir} (branch ${branch}): git could not say whether it is clean.`,
    };
  }
}
