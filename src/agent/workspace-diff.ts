/**
 * Real git working-tree diff for the verify gate (AGENT-4, REQ-agent-085).
 *
 * `runTask` used to decide "verify or skip" only from the paths tools report
 * as `filesChanged`. An edit no tool reports (code-tier `shell-exec`, a
 * delegate worker, a commit made through a shell) left the gate blind, so a
 * run could end `done` on code the verify lane never saw.
 *
 * `startWorkspaceDiff` snapshots the run's git project before the first
 * attempt: `HEAD`, `git status` (untracked files included) and a content
 * fingerprint of every dirty or untracked path. `changed()` then lists every
 * path that differs from that snapshot: paths between the start `HEAD` and
 * the current one, paths that became dirty or untracked, paths already dirty
 * whose status or content changed, and dirty paths that became clean. Paths
 * dirty before the run and left alone are not listed.
 *
 * The project root is the nearest directory at or above the cwd holding
 * `.git` (as for project instructions); when the cwd is below it, only the
 * cwd's subtree is read and paths come back relative to the cwd. No `.git`
 * above the cwd, or a first snapshot git cannot read ⇒ no tracker, and the
 * gate keeps using tool-reported files only.
 *
 * Read-only: git runs through `runGit` (argv, no shell, hooks off, repo env
 * stripped, discovery clamped to the root, `GIT_OPTIONAL_LOCKS=0`) with
 * fsmonitor off, and fingerprints are hashed in process, so nothing is
 * written to the index or object store. Gitignored paths are not seen.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { join, relative } from "node:path";
import { runGit, type GitRun } from "../../plugins/git/exec.ts";
import { parseStatusPorcelainZ } from "../../plugins/git/parse.ts";
import { findProjectRoot } from "./project-instructions.ts";
import type { WorkspaceDiffTracker } from "./types.ts";

/** Cap on one git listing (status / diff); a listing over it is unreadable. */
export const WORKSPACE_DIFF_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
/** Files up to this size are fingerprinted by content; larger ones by stat. */
export const WORKSPACE_DIFF_HASH_MAX_BYTES = 4 * 1024 * 1024;

type Git = (args: string[]) => Promise<GitRun>;

type Snapshot = {
  /** HEAD commit; null while HEAD is unborn. */
  head: string | null;
  /** Dirty or untracked path (root-relative) → status code + fingerprint. */
  dirty: Map<string, string>;
};

function ok(r: GitRun): boolean {
  return r.code === 0 && !r.truncated && !r.timedOut;
}

/** Content (or, over the cap, stat) fingerprint of one path. Never throws. */
function fingerprint(abs: string): string {
  let st;
  try {
    st = lstatSync(abs, { bigint: true });
  } catch {
    return "missing";
  }
  if (st.isSymbolicLink()) {
    try {
      return `link:${readlinkSync(abs)}`;
    } catch {
      return `link:${st.ctimeNs}`;
    }
  }
  // A nested repository or submodule directory, a fifo, …: never read.
  if (!st.isFile()) return `other:${st.mode}`;
  const meta = `${st.mode}:${st.size}`;
  if (st.size <= BigInt(WORKSPACE_DIFF_HASH_MAX_BYTES)) {
    try {
      return `file:${meta}:${createHash("sha256").update(readFileSync(abs)).digest("hex")}`;
    } catch {
      /* unreadable: fall back to stat */
    }
  }
  return `file:${meta}:${st.ino}:${st.mtimeNs}:${st.ctimeNs}`;
}

/** HEAD commit, null when unborn, undefined when git cannot say. */
async function readHead(git: Git): Promise<string | null | undefined> {
  const r = await git(["rev-parse", "--verify", "-q", "HEAD"]);
  if (r.timedOut || r.truncated) return undefined;
  if (r.code === 0) return r.stdout.trim() || undefined;
  return r.code === 1 ? null : undefined;
}

async function snapshot(
  git: Git,
  root: string,
  pathspec: string[],
): Promise<Snapshot | null> {
  const head = await readHead(git);
  if (head === undefined) return null;
  const st = await git([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--no-renames",
    ...pathspec,
  ]);
  if (!ok(st)) return null;
  const dirty = new Map<string, string>();
  for (const e of parseStatusPorcelainZ(st.stdout).entries) {
    dirty.set(e.path, `${e.index}${e.worktree}:${fingerprint(join(root, e.path))}`);
  }
  return { head, dirty };
}

/** Paths that differ between two HEADs (null = unborn); null when unreadable. */
async function headDiff(
  git: Git,
  from: string | null,
  to: string | null,
  pathspec: string[],
): Promise<string[] | null> {
  let emptyTree: string | undefined;
  if (from === null || to === null) {
    // Read-only: no -w, so nothing is written to the object store.
    const t = await git(["hash-object", "-t", "tree", "/dev/null"]);
    if (!ok(t)) return null;
    emptyTree = t.stdout.trim();
  }
  const r = await git([
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    from ?? emptyTree!,
    to ?? emptyTree!,
    ...(pathspec.length > 0 ? pathspec : ["--"]),
  ]);
  if (!ok(r)) return null;
  return r.stdout.split("\0").filter(Boolean);
}

/**
 * Snapshot the git project around `cwd` for the verify gate (REQ-agent-085).
 * Null when `cwd` is not in a git work tree or git cannot read it: the gate
 * then uses tool-reported files only. Never throws.
 */
export async function startWorkspaceDiff(
  cwd: string,
): Promise<WorkspaceDiffTracker | null> {
  try {
    const real = realpathSync(cwd);
    const root = findProjectRoot(real);
    if (!existsSync(join(root, ".git"))) return null;
    const prefix = relative(root, real);
    const pathspec = prefix ? ["--", prefix] : [];
    const git: Git = (args) =>
      runGit(root, ["-c", "core.fsmonitor=false", ...args], {
        maxStdoutBytes: WORKSPACE_DIFF_MAX_OUTPUT_BYTES,
      });
    const toCwd = (p: string) => (prefix ? relative(prefix, p) : p);
    const start = await snapshot(git, root, pathspec);
    if (!start) return null;
    return {
      async changed() {
        try {
          const now = await snapshot(git, root, pathspec);
          if (!now) return null;
          const out = new Set<string>();
          if (now.head !== start.head) {
            const moved = await headDiff(git, start.head, now.head, pathspec);
            if (!moved) return null;
            for (const p of moved) out.add(p);
          }
          for (const [p, sig] of now.dirty) {
            if (start.dirty.get(p) !== sig) out.add(p);
          }
          for (const p of start.dirty.keys()) {
            if (!now.dirty.has(p)) out.add(p);
          }
          return [...out].map(toCwd).sort();
        } catch {
          return null;
        }
      },
    };
  } catch {
    return null;
  }
}
