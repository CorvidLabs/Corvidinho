/**
 * SAFE-3 lexical cd/pushd clamp — steal Merlin fledge-plugin-shell (#570).
 * Conservative and fail-closed: ~ / $VAR / globs / `cd -` / bare cd and
 * anything the clamp cannot parse as an in-root target → refuse; no shell
 * evaluation. A quote-aware tokenizer joins line continuations, drops
 * redirections, refuses expanded command words and analyses command
 * substitutions, so redirections, quoting, `\`-newlines, `$(…)`/backticks and
 * dynamic `CDPATH`/`DIRSTACK` can no longer smuggle a `cd` past the check.
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
 * Words that can sit in front of `cd` in the same simple command and still run
 * it in this shell: reserved words, `{ }`, `!`, and builtin/command. `eval` is
 * handled separately (its argument is re-parsed as a command).
 */
const PREFIX_WORDS = new Set([
  "!", "{", "}", "if", "then", "else", "elif", "do", "while", "until", "time",
  "builtin", "command",
]);

/** `NAME=value` / `NAME+=value` assignment prefix (`X=1 cd /` still runs cd). */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;

/** Assignment (incl. array element) that pokes the shell's dir stack. */
const DIRSTACK_WRITE = /^DIRSTACK(\[|\+?=)/;

/** Literal target chars the shell would expand (glob / brace / $ / backtick). */
const EXPANSION = /[$`*?[{]/;

type Word = { value: string; expands: boolean };
type Tok = { redir: true } | { word: Word };

/** Join backslash-newline line continuations before tokenizing. */
function joinContinuations(s: string): string {
  return s.replace(/\\\n/g, "");
}

/** Index after the `)` matching the `(` at `open`, honouring quotes. */
function matchParen(s: string, open: number): number {
  let depth = 0;
  let q = "";
  for (let k = open; k < s.length; k++) {
    const c = s[k]!;
    if (q) {
      if (c === "\\" && q === '"') {
        k++;
      } else if (c === q) {
        q = "";
      }
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return k + 1;
    }
  }
  return s.length;
}

/** Index after the backtick closing the one at `open`. */
function matchBacktick(s: string, open: number): number {
  for (let k = open + 1; k < s.length; k++) {
    if (s[k] === "\\") {
      k++;
      continue;
    }
    if (s[k] === "`") return k + 1;
  }
  return s.length;
}

/**
 * Quote-aware tokenizer. Splits `cmd` into fragments (one simple command each)
 * at unquoted control operators (`; & | newline ( )`), tokenizes each fragment
 * into words + redirection markers, records whether a word carries a shell
 * expansion (`$` / `$(…)` / backtick), and appends any command-substitution
 * body to `substitutions` for separate analysis.
 */
function tokenizeFragments(cmd: string, substitutions: string[]): Tok[][] {
  const frags: Tok[][] = [];
  let cur: Tok[] = [];
  let value = "";
  let expands = false;
  let inWord = false;

  const endWord = () => {
    if (inWord) cur.push({ word: { value, expands } });
    value = "";
    expands = false;
    inWord = false;
  };
  const endFrag = () => {
    endWord();
    frags.push(cur);
    cur = [];
  };
  const captureSubst = (open: number, paren: boolean): number => {
    inWord = true;
    expands = true;
    const end = paren ? matchParen(cmd, open + 1) : matchBacktick(cmd, open);
    const raw = cmd.slice(open, end);
    value += raw;
    const body = paren
      ? cmd.slice(open + 2, Math.max(open + 2, end - 1))
      : cmd.slice(open + 1, Math.max(open + 1, end - 1));
    substitutions.push(body);
    return end;
  };

  let i = 0;
  const n = cmd.length;
  while (i < n) {
    const c = cmd[i]!;

    if (c === "'") {
      inWord = true;
      i++;
      while (i < n && cmd[i] !== "'") {
        value += cmd[i];
        i++;
      }
      i++;
      continue;
    }
    if (c === '"') {
      inWord = true;
      i++;
      while (i < n && cmd[i] !== '"') {
        const d = cmd[i]!;
        if (d === "\\" && i + 1 < n && '"$`\\'.includes(cmd[i + 1]!)) {
          value += cmd[i + 1];
          i += 2;
          continue;
        }
        if (d === "$" && cmd[i + 1] === "(") {
          i = captureSubst(i, true);
          continue;
        }
        if (d === "$") {
          expands = true;
          value += d;
          i++;
          continue;
        }
        if (d === "`") {
          i = captureSubst(i, false);
          continue;
        }
        value += d;
        i++;
      }
      i++;
      continue;
    }
    if (c === "\\") {
      if (i + 1 < n) {
        inWord = true;
        value += cmd[i + 1];
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    if (c === " " || c === "\t") {
      endWord();
      i++;
      continue;
    }
    if (c === "\n" || c === ";") {
      endFrag();
      i++;
      continue;
    }
    if (c === "|") {
      endFrag();
      i++;
      if (cmd[i] === "|") i++;
      continue;
    }
    if (c === "(" || c === ")") {
      endFrag();
      i++;
      continue;
    }
    if (c === "&") {
      if (cmd[i + 1] === ">") {
        // bash `&>` / `&>>` redirection.
        endWord();
        i += 2;
        if (cmd[i] === ">") i++;
        cur.push({ redir: true });
        continue;
      }
      endFrag();
      i++;
      if (cmd[i] === "&") i++;
      continue;
    }
    if (c === ">" || c === "<") {
      // A leading all-digit word is the fd of this redirection, not a token.
      if (inWord && /^\d+$/.test(value)) {
        value = "";
        expands = false;
        inWord = false;
      } else {
        endWord();
      }
      i++;
      const d = cmd[i];
      if (
        d === ">" ||
        d === "&" ||
        d === "|" ||
        (c === "<" && (d === ">" || d === "<"))
      ) {
        i++;
      }
      cur.push({ redir: true });
      continue;
    }
    if (c === "$" && cmd[i + 1] === "(") {
      i = captureSubst(i, true);
      continue;
    }
    if (c === "$") {
      inWord = true;
      expands = true;
      value += c;
      i++;
      continue;
    }
    if (c === "`") {
      i = captureSubst(i, false);
      continue;
    }
    inWord = true;
    value += c;
    i++;
  }
  endFrag();
  return frags;
}

/** Words of a fragment with each redirection operator + its target dropped. */
function stripRedirections(frag: Tok[]): Word[] {
  const consumed = new Array<boolean>(frag.length).fill(false);
  for (let k = 0; k < frag.length; k++) {
    if ("redir" in frag[k]!) {
      for (let m = k + 1; m < frag.length; m++) {
        if ("word" in frag[m]!) {
          consumed[m] = true;
          break;
        }
      }
    }
  }
  const words: Word[] = [];
  for (let k = 0; k < frag.length; k++) {
    const tk = frag[k]!;
    if ("word" in tk && !consumed[k]) words.push(tk.word);
  }
  return words;
}

/** First offending cd/pushd target within one simple command, else null. */
function analyzeFragment(
  words: Word[],
  root: string,
  evalCommand: (cmd: string) => string | null,
): string | null {
  let i = 0;
  while (i < words.length) {
    const w = words[i]!;
    if (DIRSTACK_WRITE.test(w.value)) return "$DIRSTACK";
    if (PREFIX_WORDS.has(w.value)) {
      i++;
      while (i < words.length && words[i]!.value.startsWith("-")) i++;
      continue;
    }
    if (w.value === "function") {
      i += 2; // `function name { … }`
      continue;
    }
    if (ASSIGNMENT.test(w.value)) {
      i++;
      continue;
    }
    break;
  }
  const head = words[i];
  if (!head) return null;
  // A command word the shell would expand ($, $(…), backtick) is not lexical.
  if (head.expands) return head.value || "$(...)";
  if (head.value === "eval") {
    const rest = words.slice(i + 1);
    if (rest.some((w) => w.expands)) {
      return rest.find((w) => w.expands)!.value || "$(...)";
    }
    return evalCommand(rest.map((w) => w.value).join(" "));
  }
  if (head.value !== "cd" && head.value !== "pushd") return null;

  let j = i + 1;
  while (j < words.length) {
    const a = words[j]!.value;
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
  const target = words[j];
  if (target == null || target.value === "") {
    return "$HOME"; // bare `cd` (or only options) → home
  }
  if (target.value === "-") return "$OLDPWD";
  if (target.expands) return target.value; // $VAR / $(…) / backtick in target
  if (EXPANSION.test(target.value)) return target.value; // glob / brace / literal $
  if (isCdEscape(target.value, root)) return target.value;
  return null;
}

/**
 * First offending cd/pushd target in `cmd`, or null when every cd-like is safe.
 * Fail-closed: unparsable or expanded command words, `cd -`, expanded or
 * escaping targets, dir-stack writes and escaping cd inside command
 * substitutions all refuse. Runtime hardening (`CDPATH=; readonly CDPATH`,
 * dropped `CDPATH`/`OLDPWD`) covers what a lexer cannot, so CDPATH is no longer
 * refused lexically.
 */
export function firstDisallowedCd(cmd: string, root: string): string | null {
  const joined = joinContinuations(cmd);
  const substitutions: string[] = [];
  const frags = tokenizeFragments(joined, substitutions);
  const evalCommand = (inner: string): string | null =>
    firstDisallowedCd(inner, root);
  for (const frag of frags) {
    const r = analyzeFragment(stripRedirections(frag), root, evalCommand);
    if (r != null) return r;
  }
  for (const body of substitutions) {
    const r = firstDisallowedCd(body, root);
    if (r != null) return r;
  }
  return null;
}

export function clampRefuseMessage(root: string, target: string): string {
  return (
    `shell-exec refused (SAFE-3): command would escape the project root ` +
    `(${root}) via cd/pushd to ${target}. Stay inside the project cwd.`
  );
}
