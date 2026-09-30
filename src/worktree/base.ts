/**
 * Where a talk branch started, and whether the last run in a talk worktree
 * ended verified (AGENT-15.a, REQ-agent-015).
 *
 * - `resolveBase`: the base branch (the remote's default branch, else `main`)
 *   and the talk branch's merge-base with it. /work compares against it
 *   before a push (REQ-discord-088), and the verify gate uses it as the
 *   baseline of a run that follows one that did not end verified.
 * - `talkWorktreeGitDir`: the own git dir of a linked talk worktree (one
 *   `ensureTalkWorkspace` made: its git admin dir is `worktrees/talk-*`).
 * - The verified marker, a file in that git dir (never in the working tree,
 *   so it is never part of a diff): written when the worktree is made and
 *   when a run in it ends `done`; taken away when a run starts. A worktree
 *   without it (a run that ended blocked, failed or cancelled, or a process
 *   that died mid-run) makes the next run verify every edit since the talk
 *   started.
 */

import {
  closeSync,
  constants,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { GitRun } from "../../plugins/git/exec.ts";

/** `git` in a directory (argv, no shell). */
export type GitIn = (cwd: string, args: string[]) => Promise<GitRun>;

/** File in a talk worktree's own git dir: its last run ended `done`. */
export const TALK_VERIFIED_MARKER = "corvidinho-verified";

/**
 * The base branch the talk branch is compared against (`<remote>/HEAD`'s
 * branch, else `main`) and HEAD's merge-base with it, from
 * `refs/remotes/<remote>/<base>` or else `refs/heads/<base>`. Null when
 * neither ref exists or git cannot say.
 */
export async function resolveBase(
  git: GitIn,
  cwd: string,
  remote = "origin",
): Promise<{ base: string; mergeBase: string } | null> {
  const head = await git(cwd, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`]);
  const sym = head.code === 0 ? head.stdout.trim() : "";
  const base = sym.startsWith(`${remote}/`) ? sym.slice(remote.length + 1) : "main";
  for (const ref of [`refs/remotes/${remote}/${base}`, `refs/heads/${base}`]) {
    const v = await git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    if (v.code !== 0) continue;
    const mb = await git(cwd, ["merge-base", "HEAD", ref]);
    const sha = mb.stdout.trim();
    if (mb.code === 0 && sha) return { base, mergeBase: sha };
  }
  return null;
}

/**
 * The own git dir (`<common>/worktrees/talk-*`) of the linked talk worktree
 * whose top level is `top`, from its `.git` file; null for any other
 * checkout (a main checkout, another linked worktree, a submodule) or when it
 * cannot be read. Never throws.
 */
export function talkWorktreeGitDir(top: string): string | null {
  try {
    const dotGit = join(top, ".git");
    if (!lstatSync(dotGit).isFile()) return null;
    const m = readFileSync(dotGit, "utf8").match(/^gitdir:[ \t]*(.+?)[ \t]*$/m);
    if (!m) return null;
    const gitDir = resolve(top, m[1]!);
    if (basename(dirname(gitDir)) !== "worktrees") return null;
    if (!basename(gitDir).startsWith("talk-")) return null;
    return statSync(gitDir).isDirectory() ? gitDir : null;
  } catch {
    return null;
  }
}

/**
 * Take the verified marker away as a run starts. True only when it was there
 * and is now gone; false when it was missing or could not be removed, so the
 * run then verifies every edit since the talk started (fail closed).
 */
export function takeTalkVerified(gitDir: string): boolean {
  const path = join(gitDir, TALK_VERIFIED_MARKER);
  try {
    if (!lstatSync(path).isFile()) return false;
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Record how a run in a talk worktree ended: `done` writes the marker (never
 * through a symlink), anything else removes one written meanwhile. Never
 * throws; a marker that cannot be written only makes the next run verify
 * more.
 */
export function settleTalkVerified(gitDir: string, done: boolean): void {
  const path = join(gitDir, TALK_VERIFIED_MARKER);
  if (!done) {
    try {
      unlinkSync(path);
    } catch {
      /* not there */
    }
    return;
  }
  let fd: number | undefined;
  try {
    fd = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
      0o600,
    );
    writeSync(fd, `${new Date().toISOString()}\n`);
  } catch {
    /* next run verifies from the merge-base */
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
}
