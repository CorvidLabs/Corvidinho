/**
 * Resolve a user path under project cwd; refuse escapes and symlink escapes.
 */

import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
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

/**
 * Resolve `userPath` under `cwd`. Returns an absolute path still inside the project.
 * Target need not exist (writes); when it or an ancestor exists, symlink targets
 * are checked so a link cannot escape the root.
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
  while (!existsSync(walk)) {
    const parent = dirname(walk);
    if (parent === walk) break;
    segments.unshift(walk.slice(parent.length).replace(/^[/\\]/, ""));
    walk = parent;
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
