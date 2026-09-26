/**
 * SAFE-3 lexical cd/pushd clamp — steal Merlin fledge-plugin-shell (#570).
 * Conservative: ~ / $VAR / globs / `cd -` / bare cd → refuse; no shell evaluation.
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

/** Drop quote and backslash characters (approximate shell quote removal). */
function dequote(s: string): string {
  return s.replace(/["'\\]/g, "");
}

/**
 * Words that can sit in front of `cd` in the same fragment and still run it
 * in this shell: reserved words, `{ }`, `!`, and builtin/command/eval.
 */
const PREFIX_WORDS = new Set([
  "!", "{", "}", "if", "then", "else", "elif", "do", "while", "until", "time",
  "builtin", "command", "eval",
]);

/** `NAME=value` assignment prefix (`X=1 cd /` still runs the cd builtin). */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Targets the shell would expand ($VAR, `cmd`, globs, braces) — not lexical. */
const EXPANSION = /[$`*?[{]/;

/**
 * First offending cd/pushd target in `cmd`, or null when every cd-like is safe.
 * Splits on common shell metachars (; & | newline parens) — conservative lexer.
 * Skips prefix words and assignments to find the command word, skips cd/pushd
 * options to find the target, and refuses `-` (OLDPWD), expansions, and
 * CDPATH-searched targets when the command sets CDPATH.
 */
export function firstDisallowedCd(cmd: string, root: string): string | null {
  const separators = /[;&|\n()]/;
  const setsCdpath = /\bCDPATH\b/.test(dequote(cmd));
  for (const rawFrag of cmd.split(separators)) {
    const tokens = rawFrag.split(/\s+/).filter(Boolean).map(dequote);
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i]!;
      if (PREFIX_WORDS.has(t)) {
        i++;
        // `command -p`, `time -p` …
        while (i < tokens.length && tokens[i]!.startsWith("-")) i++;
        continue;
      }
      if (t === "function") {
        i += 2; // `function name { …`
        continue;
      }
      if (ASSIGNMENT.test(t)) {
        i++;
        continue;
      }
      break;
    }
    const head = tokens[i];
    if (head !== "cd" && head !== "pushd") continue;
    let j = i + 1;
    while (j < tokens.length) {
      const a = tokens[j]!;
      if (a === "--") {
        j++;
        break;
      }
      if (/^-[A-Za-z@]+$/.test(a)) {
        j++; // -P / -L / -e / -@ / -n
        continue;
      }
      break;
    }
    const target = tokens[j];
    if (target == null || target === "") {
      // Bare `cd` (or only options) → home — escape
      return "$HOME";
    }
    if (target === "-") return "$OLDPWD";
    if (EXPANSION.test(target)) return target;
    if (
      setsCdpath &&
      !isAbsolute(target) &&
      !/^\.\.?(\/|$)/.test(target)
    ) {
      return `$CDPATH/${target}`;
    }
    if (isCdEscape(target, root)) {
      return target;
    }
  }
  return null;
}

export function clampRefuseMessage(root: string, target: string): string {
  return (
    `shell-exec refused (SAFE-3): command would escape the project root ` +
    `(${root}) via cd/pushd to ${target}. Stay inside the project cwd.`
  );
}
