/**
 * Real worktree delta for the prove-before-done gate (AGENT-4 / FLEDGE-2, #85).
 *
 * The loop used to decide "did this run change anything?" only from the
 * `filesChanged` a tool reported. A tool that does not self-report (e.g.
 * `shell-exec`) could edit files and the run would still say done without the
 * verify lane. This probe fingerprints the git worktree before the run
 * (HEAD + `git status --porcelain` + a content fingerprint of each listed
 * path) and lists what differs afterwards, so any real change triggers the
 * gate. It only ever ADDS a reason to verify; it never skips verification a
 * tool report asked for.
 *
 * Not a git repo / git missing → `snapshot` returns null and the loop falls
 * back to tool-reported changes only. Read-only: git runs with
 * GIT_OPTIONAL_LOCKS=0 so status never takes index.lock.
 */

import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

export type GitRunResult = { code: number; stdout: string };

/** Injectable git runner (tests use real temp repos or fakes). */
export type GitRunner = (args: string[], cwd: string) => Promise<GitRunResult>;

export type WorkspaceSnapshot = {
  /** Absolute worktree root (`git rev-parse --show-toplevel`). */
  root: string;
  /** HEAD commit, or null before the first commit. */
  head: string | null;
  /** Root-relative path → `<XY status>:<content fingerprint>`. */
  entries: Map<string, string>;
};

export type WorkspaceProbe = {
  /** Fingerprint the worktree that contains `cwd`; null when it is not one. */
  snapshot(cwd: string): Promise<WorkspaceSnapshot | null>;
  /** Root-relative paths that differ from `before` (empty = no real change). */
  changedSince(before: WorkspaceSnapshot): Promise<string[]>;
};

/** Env that would point git at another repo/index (e.g. inside a git hook). */
const GIT_ENV_STRIP = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
] as const;

/** Files larger than this are fingerprinted by size + mtime, not content. */
const MAX_HASH_BYTES = 4 * 1024 * 1024;
/** Above this many dirty paths, fingerprint by size + mtime only. */
const MAX_HASHED_ENTRIES = 5000;

export const defaultGitRunner: GitRunner = async (args, cwd) => {
  const git = Bun.which("git");
  if (!git) return { code: 127, stdout: "" };
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of GIT_ENV_STRIP) delete env[k];
  env.GIT_OPTIONAL_LOCKS = "0";
  try {
    const proc = Bun.spawn([git, ...args], {
      cwd,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    });
    const [stdout, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    return { code, stdout };
  } catch {
    // Missing cwd or spawn failure: treat as "not a worktree".
    return { code: 1, stdout: "" };
  }
};

/**
 * Parse `git status --porcelain=v1 -z` into root-relative paths with their
 * two-letter status. Renames/copies carry the original path as the next
 * record; both paths are reported so a move counts on either side.
 */
export function parsePorcelainZ(
  out: string,
): Array<{ xy: string; path: string }> {
  const records = out.split("\0");
  const entries: Array<{ xy: string; path: string }> = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.length < 4) continue;
    const xy = rec.slice(0, 2);
    entries.push({ xy, path: rec.slice(3) });
    if (xy[0] === "R" || xy[0] === "C") {
      const orig = records[i + 1];
      if (orig) entries.push({ xy, path: orig });
      i++;
    }
  }
  return entries;
}

function fingerprint(abs: string, hashContent: boolean): string {
  try {
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) return `l:${readlinkSync(abs)}`;
    if (st.isDirectory()) return `d:${st.mtimeMs}`;
    if (!hashContent || st.size > MAX_HASH_BYTES) {
      return `s:${st.size}:${st.mtimeMs}`;
    }
    return `h:${Bun.hash(readFileSync(abs)).toString(16)}`;
  } catch {
    return "absent";
  }
}

export async function snapshotWorkspace(
  cwd: string,
  run: GitRunner = defaultGitRunner,
): Promise<WorkspaceSnapshot | null> {
  const top = await run(["rev-parse", "--show-toplevel"], cwd);
  const root = top.stdout.trim();
  if (top.code !== 0 || !root) return null;
  const status = await run(
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    root,
  );
  if (status.code !== 0) return null;
  const head = await run(["rev-parse", "--verify", "-q", "HEAD"], root);
  const listed = parsePorcelainZ(status.stdout);
  const hashContent = listed.length <= MAX_HASHED_ENTRIES;
  const entries = new Map<string, string>();
  for (const { xy, path } of listed) {
    entries.set(path, `${xy}:${fingerprint(join(root, path), hashContent)}`);
  }
  return {
    root,
    head: head.code === 0 ? head.stdout.trim() || null : null,
    entries,
  };
}

export async function workspaceChangedSince(
  before: WorkspaceSnapshot,
  run: GitRunner = defaultGitRunner,
): Promise<string[]> {
  const after = await snapshotWorkspace(before.root, run);
  if (!after) return [];
  const changed = new Set<string>();
  for (const [path, fp] of after.entries) {
    if (before.entries.get(path) !== fp) changed.add(path);
  }
  for (const path of before.entries.keys()) {
    if (!after.entries.has(path)) changed.add(path);
  }
  // Committed work leaves a clean status but moves HEAD: diff the two trees.
  if (before.head && after.head && before.head !== after.head) {
    const diff = await run(
      ["diff", "--name-only", "-z", before.head, after.head],
      before.root,
    );
    if (diff.code === 0) {
      for (const p of diff.stdout.split("\0")) if (p) changed.add(p);
    }
  }
  return [...changed].sort();
}

/** Default probe used by `runTask` (real git in the task cwd). */
export function createGitWorkspaceProbe(
  run: GitRunner = defaultGitRunner,
): WorkspaceProbe {
  return {
    snapshot: (cwd) => snapshotWorkspace(cwd, run),
    changedSince: (before) => workspaceChangedSince(before, run),
  };
}

export const gitWorkspaceProbe: WorkspaceProbe = createGitWorkspaceProbe();

