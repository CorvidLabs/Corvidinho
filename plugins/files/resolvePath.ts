/**
 * Resolve a user path under project cwd; refuse escapes and symlink escapes.
 */

import {
  existsSync,
  lstatSync,
  readlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";

export class PathEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathEscapeError";
  }
}

function realRoot(cwd: string): string {
  try {
    return realpathSync(resolve(cwd));
  } catch {
    return resolve(cwd);
  }
}

/** True if `abs` is equal to or inside `root` (both absolute, normalized). */
export function isInsideRoot(root: string, abs: string): boolean {
  const rel = relative(root, abs);
  if (rel === "") return true;
  if (rel === ".." || rel.startsWith(".." + sep)) return false;
  if (isAbsolute(rel)) return false;
  return true;
}

/** True when `p` names a directory entry, including a dangling symlink (existsSync follows links). */
function entryExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Dangling symlink hops followed by hand before refusing (Linux SYMLOOP_MAX). */
const MAX_SYMLINK_HOPS = 40;

/**
 * Resolve `userPath` under `cwd`. Returns an absolute path still inside the project.
 * Target need not exist (writes); when it or an ancestor exists, symlink targets
 * are checked so a link cannot escape the root. A dangling symlink (leaf or
 * ancestor) is followed by hand and its target re-clamped, so the returned path
 * is where a write would land and callers' SAFE-2 checks see that path.
 */
export function resolveProjectPath(cwd: string, userPath: string): string {
  if (!userPath || !String(userPath).trim()) {
    throw new PathEscapeError("missing path");
  }
  const raw = String(userPath).trim();
  const root = realRoot(cwd);

  const candidate = isAbsolute(raw)
    ? normalize(raw)
    : resolve(root, raw);

  if (!isInsideRoot(root, candidate)) {
    throw new PathEscapeError(
      `Path traversal denied: "${raw}" resolves outside the project directory`,
    );
  }

  return clampUnderRoot(root, raw, candidate, 0);
}

function clampUnderRoot(
  root: string,
  raw: string,
  candidate: string,
  hops: number,
): string {
  if (existsSync(candidate)) {
    let real: string;
    try {
      real = realpathSync(candidate);
    } catch {
      real = candidate;
    }
    if (!isInsideRoot(root, real)) {
      throw new PathEscapeError(
        `Symlink escape denied: "${raw}" resolves outside the project directory`,
      );
    }
    return real;
  }

  // Walk up to an existing ancestor; resolve it; rebuild the relative suffix under it.
  const segments: string[] = [];
  let walk = candidate;
  while (!entryExists(walk)) {
    const parent = dirname(walk);
    if (parent === walk) break;
    segments.unshift(walk.slice(parent.length).replace(/^[/\\]/, ""));
    walk = parent;
  }

  if (entryExists(walk) && !existsSync(walk)) {
    // `walk` is a dangling (or looping) symlink: writing through it would follow
    // the link, so follow it here and clamp where it points.
    if (hops >= MAX_SYMLINK_HOPS) {
      throw new PathEscapeError(
        `Symlink loop denied: "${raw}" has too many levels of symbolic links`,
      );
    }
    let linkDir: string;
    let target: string;
    try {
      linkDir = realpathSync(dirname(walk));
      target = resolve(linkDir, readlinkSync(walk));
    } catch {
      throw new PathEscapeError(
        `Symlink escape denied: "${raw}" is a symlink that cannot be resolved`,
      );
    }
    const next = segments.length ? join(target, ...segments) : target;
    if (!isInsideRoot(root, linkDir) || !isInsideRoot(root, next)) {
      throw new PathEscapeError(
        `Symlink escape denied: "${raw}" resolves outside the project directory`,
      );
    }
    return clampUnderRoot(root, raw, next, hops + 1);
  }

  if (existsSync(walk)) {
    let realWalk: string;
    try {
      if (lstatSync(walk).isSymbolicLink()) {
        realWalk = realpathSync(walk);
      } else {
        realWalk = realpathSync(walk);
      }
    } catch {
      realWalk = walk;
    }
    if (!isInsideRoot(root, realWalk)) {
      throw new PathEscapeError(
        `Symlink escape denied: "${raw}" parent resolves outside the project directory`,
      );
    }
    const rebuilt = segments.length ? join(realWalk, ...segments) : realWalk;
    if (!isInsideRoot(root, rebuilt)) {
      throw new PathEscapeError(
        `Path traversal denied: "${raw}" resolves outside the project directory`,
      );
    }
    return rebuilt;
  }

  return candidate;
}

/** Ensure path is a regular file that exists (for read/edit/delete). */
export function assertExistingFile(absPath: string): void {
  if (!existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }
  const st = lstatSync(absPath);
  if (st.isSymbolicLink()) {
    // resolveProjectPath already realpath'd existing paths; still require file
    const real = realpathSync(absPath);
    const rst = statSync(real);
    if (!rst.isFile()) throw new Error(`Not a file: ${absPath}`);
    return;
  }
  if (!st.isFile()) {
    throw new Error(`Not a file: ${absPath}`);
  }
}
