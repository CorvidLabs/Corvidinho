/**
 * SAFE-3 lexical cd/pushd clamp — steal Merlin fledge-plugin-shell (#570).
 * Conservative: ~ / $VAR / bare cd → refuse; no shell evaluation.
 */

import { isAbsolute, join, normalize, resolve, sep } from "node:path";

/** Strip surrounding quotes from a cd target token. */
export function stripQuotes(s: string): string {
  let t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith("`") && t.endsWith("`"))
  ) {
    t = t.slice(1, -1);
  }
  return t;
}

/**
 * True when `target` (literal cd arg) would land outside `root`.
 * Lexical only — no IO / canonicalize.
 */
export function isCdEscape(target: string, root: string): boolean {
  if (!target || !target.trim()) return true;
  const t = target.trim();
  if (t.startsWith("~") || t.startsWith("$")) return true;

  const rootAbs = resolve(root);
  const candidate = isAbsolute(t) ? normalize(t) : normalize(join(rootAbs, t));

  // Walk components with a stack; ParentDir that empties = escape.
  const stack: string[] = [];
  let absolute = false;
  const parts = candidate.split(/[/\\]+/).filter((p) => p.length > 0);
  // Preserve absolute marker on POSIX
  if (candidate.startsWith("/") || /^[A-Za-z]:/.test(candidate)) {
    absolute = true;
  }
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return true;
      stack.pop();
      continue;
    }
    // Drive letter on Windows-style — treat as reset
    if (/^[A-Za-z]:$/.test(part)) {
      stack.length = 0;
      absolute = true;
      continue;
    }
    stack.push(part);
  }

  const rootParts = rootAbs
    .split(/[/\\]+/)
    .filter((p) => p.length > 0 && p !== ".");

  // Relative path that never went absolute but emptied via .. already returned.
  // Absolute or root-joined path: must be prefix of rootNormals.
  if (absolute || isAbsolute(candidate)) {
    if (stack.length < rootParts.length) return true;
    for (let i = 0; i < rootParts.length; i++) {
      if (stack[i] !== rootParts[i]) return true;
    }
    return false;
  }

  // Shouldn't reach: join(root, rel) is always absolute after normalize on POSIX
  void sep;
  if (stack.length < rootParts.length) return true;
  for (let i = 0; i < rootParts.length; i++) {
    if (stack[i] !== rootParts[i]) return true;
  }
  return false;
}

/**
 * Quoting / expansion characters left in a word after `stripQuotes`. The
 * lexical clamp cannot tell what the shell turns such a word into
 * (`""/etc`, `\/etc`, `"$(…)"`, backticks, `{a,b}`), so it fails closed.
 */
const UNPARSEABLE_WORD = /["'`\\${}]/;

/**
 * Offending target for one cd/pushd invocation (`args` = words after the
 * head), or null when it stays inside `root`. Skips option words (`-P`,
 * `-L`, `-e`, `-@`, `-PL`, pushd `-n`, …) and a terminating `--` before
 * taking the target. Lone `-` (OLDPWD), no target (home) and unparseable
 * words refuse (fail closed).
 */
function cdArgsOffending(args: string[], root: string): string | null {
  let i = 0;
  for (; i < args.length; i++) {
    const word = stripQuotes(args[i]!);
    if (UNPARSEABLE_WORD.test(word)) return word;
    if (word === "--") {
      i++;
      break;
    }
    if (word === "-") return "$OLDPWD";
    if (!word.startsWith("-")) break;
    // Option word — skip.
  }
  const targetRaw = args[i];
  if (targetRaw == null) {
    // Bare `cd` (or options only) → home — escape
    return "$HOME";
  }
  const target = stripQuotes(targetRaw);
  // `cd -- -` still means OLDPWD in bash.
  if (target === "-") return "$OLDPWD";
  if (UNPARSEABLE_WORD.test(target)) return target;
  return isCdEscape(target, root) ? target : null;
}

/**
 * First offending cd/pushd target in `cmd`, or null when every cd-like is safe.
 * Splits on common shell metachars (; & | newline parens) — conservative lexer.
 */
export function firstDisallowedCd(cmd: string, root: string): string | null {
  const separators = /[;&|\n()]/;
  for (const rawFrag of cmd.split(separators)) {
    const frag = rawFrag.trim();
    if (!frag) continue;
    const tokens = frag.split(/\s+/).filter(Boolean);
    const head = tokens[0];
    if (head !== "cd" && head !== "pushd") continue;
    const offending = cdArgsOffending(tokens.slice(1), root);
    if (offending != null) return offending;
  }
  return null;
}

export function clampRefuseMessage(root: string, target: string): string {
  return (
    `shell-exec refused (SAFE-3): command would escape the project root ` +
    `(${root}) via cd/pushd to ${target}. Stay inside the project cwd.`
  );
}
