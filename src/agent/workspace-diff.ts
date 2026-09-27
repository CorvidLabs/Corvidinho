/**
 * Real git working-tree diff for the verify gate (AGENT-4, REQ-agent-085).
 *
 * `runTask` used to decide "verify or skip" only from the paths tools report
 * as `filesChanged`. An edit no tool reports (code-tier `shell-exec`, a
 * delegate worker, a commit made through a shell) left the gate blind, so a
 * run could end `done` on code the verify lane never saw.
 *
 * `startWorkspaceDiff` snapshots the run's git project before the first
 * attempt: `HEAD`, `git status` (untracked files included) and a fingerprint
 * of every dirty or untracked path. `changed()` then lists every path that
 * differs from that snapshot: paths between the start `HEAD` and the current
 * one, paths that became dirty or untracked, paths already dirty whose status
 * or content changed, and dirty paths that became clean. Paths dirty before
 * the run and left alone are not listed.
 *
 * Cost stays bounded: only paths dirty at the start are fingerprinted (a path
 * that becomes dirty later is a change by itself), content hashing of them
 * stops after `WORKSPACE_DIFF_HASH_BUDGET_BYTES` (the rest compare by stat),
 * and a git listing over `WORKSPACE_DIFF_MAX_OUTPUT_BYTES` is unreadable.
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
 * written to the index or object store. Files are opened without following
 * links and without blocking, so a path swapped for a symlink or a fifo is
 * never read. Gitignored paths are not seen.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
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
/**
 * Content bytes hashed for the paths already dirty at the start; once spent,
 * the remaining ones are fingerprinted by stat (same kind on every compare).
 */
export const WORKSPACE_DIFF_HASH_BUDGET_BYTES = 64 * 1024 * 1024;
/**
 * Real-diff paths one run adds to `filesChanged` (the gate note still counts
 * them all), so the NDJSON `result` line stays under the parser's line cap.
 */
export const WORKSPACE_DIFF_MAX_FILES = 1000;

/** Internal knobs (tests); not a product surface. */
export type WorkspaceDiffLimits = {
  /** Default `WORKSPACE_DIFF_HASH_BUDGET_BYTES`. */
  hashBudgetBytes?: number;
};

type Git = (args: string[]) => Promise<GitRun>;

type Kind = "content" | "stat";

type Listing = {
  /** HEAD commit; null while HEAD is unborn. */
  head: string | null;
  /** Dirty or untracked paths (root-relative) with their status code. */
  entries: { path: string; xy: string }[];
};

type StartEntry = { xy: string; kind: Kind; fp: string };

function ok(r: GitRun): boolean {
  return r.code === 0 && !r.truncated && !r.timedOut;
}

/**
 * Fingerprint of one path: content (kind "content", up to the size cap) or
 * stat identity; symlinks by target, never followed; directories (a nested
 * repository or submodule) and fifos never read. Never throws.
 */
function fingerprint(abs: string, kind: Kind): { fp: string; hashed: number } {
  let st;
  try {
    st = lstatSync(abs, { bigint: true });
  } catch {
    return { fp: "missing", hashed: 0 };
  }
  if (st.isSymbolicLink()) {
    try {
      return { fp: `link:${readlinkSync(abs)}`, hashed: 0 };
    } catch {
      return { fp: `link:${st.ctimeNs}`, hashed: 0 };
    }
  }
  if (!st.isFile()) return { fp: `other:${st.mode}`, hashed: 0 };
  const byStat = {
    fp: `file:${st.mode}:${st.size}:${st.ino}:${st.mtimeNs}:${st.ctimeNs}`,
    hashed: 0,
  };
  const cap = BigInt(WORKSPACE_DIFF_HASH_MAX_BYTES);
  if (kind === "stat" || st.size > cap) return byStat;
  let fd: number | undefined;
  try {
    // No follow, no block: a path swapped after lstat is never read through.
    fd = openSync(abs, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const fst = fstatSync(fd, { bigint: true });
    if (!fst.isFile() || fst.size > cap) return byStat;
    const buf = readFileSync(fd);
    const sum = createHash("sha256").update(buf).digest("hex");
    return { fp: `file:${fst.mode}:${fst.size}:${sum}`, hashed: buf.byteLength };
  } catch {
    return byStat; // unreadable: stat identity
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

/** HEAD commit, null when unborn, undefined when git cannot say. */
async function readHead(git: Git): Promise<string | null | undefined> {
  const r = await git(["rev-parse", "--verify", "-q", "HEAD"]);
  if (r.timedOut || r.truncated) return undefined;
  if (r.code === 0) return r.stdout.trim() || undefined;
  return r.code === 1 ? null : undefined;
}

async function listing(git: Git, pathspec: string[]): Promise<Listing | null> {
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
  const entries = parseStatusPorcelainZ(st.stdout).entries.map((e) => ({
    path: e.path,
    xy: `${e.index}${e.worktree}`,
  }));
  return { head, entries };
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
  limits: WorkspaceDiffLimits = {},
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
    const first = await listing(git, pathspec);
    if (!first) return null;
    const startHead = first.head;
    const start = new Map<string, StartEntry>();
    let budget = limits.hashBudgetBytes ?? WORKSPACE_DIFF_HASH_BUDGET_BYTES;
    for (const e of first.entries) {
      const kind: Kind = budget > 0 ? "content" : "stat";
      const f = fingerprint(join(root, e.path), kind);
      budget -= f.hashed;
      start.set(e.path, { xy: e.xy, kind, fp: f.fp });
    }
    return {
      async changed() {
        try {
          const now = await listing(git, pathspec);
          if (!now) return null;
          const out = new Set<string>();
          if (now.head !== startHead) {
            const moved = await headDiff(git, startHead, now.head, pathspec);
            if (!moved) return null;
            for (const p of moved) out.add(p);
          }
          const seen = new Set<string>();
          for (const e of now.entries) {
            seen.add(e.path);
            const was = start.get(e.path);
            // Only a path dirty at the start is fingerprinted again (same
            // kind as then); newly dirty or untracked is a change by itself.
            if (
              !was ||
              was.xy !== e.xy ||
              fingerprint(join(root, e.path), was.kind).fp !== was.fp
            ) {
              out.add(e.path);
            }
          }
          for (const p of start.keys()) {
            if (!seen.has(p)) out.add(p);
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
