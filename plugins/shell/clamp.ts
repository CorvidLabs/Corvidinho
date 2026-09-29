/**
 * SAFE-3 lexical cd/pushd clamp — steal Merlin fledge-plugin-shell (#570).
 * Conservative and fail-closed: ~ / $VAR / globs / `cd -` / bare cd and
 * anything the clamp cannot parse as an in-root target → refuse; no shell
 * evaluation. A quote-aware tokenizer reads quoting, `\`-newline
 * continuations, `#` comments and here-doc bodies the way dash does, drops
 * redirections, refuses expanded command words and analyses command
 * substitutions, so redirections, quoting, `\`-newlines, `$(…)`/backticks and
 * dynamic `CDPATH`/`DIRSTACK` can no longer smuggle a `cd` past the check. A
 * `cd`/`pushd` left open by an unterminated quote or a trailing `\` refuses.
 * `eval` arguments, `trap` actions, shell `-c` strings and the scripts a
 * command runs in a shell (sourced, handed to a shell, or run by path) are
 * read and checked the same way; a script it cannot read refuses. No shell
 * evaluation still means another interpreter's `chdir` is out of reach.
 */

import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
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

/** A word, its expansion flag, and where it starts in the tokenized text. */
type Word = { value: string; expands: boolean; start: number };
/**
 * A redirection: `in` (`<`, `<&`), `out` (`>`, `>>`, `>|`, `>&`, `&>`), `rw`
 * (`<>`), `heredoc` (`<<`, `<<-`) or `herestring` (`<<<`).
 */
type RedirKind = "in" | "out" | "rw" | "heredoc" | "herestring";
/** A here-doc's body as the shell read it, and whether it is expanded. */
type HereDocBody = { body: string; literal: boolean };
/** A redirection marker: its target is the next word. */
type Redir = { redir: RedirKind; doc?: HereDocBody };
type Tok = Redir | { word: Word };

/**
 * A tokenized command: its simple commands, the command substitutions inside
 * it (each already tokenized), and where the scan stopped.
 */
type Lexed = {
  /** The text that word `start` offsets refer to. */
  text: string;
  frags: Tok[][];
  subs: Lexed[];
  /** Nesting depth: substitutions and `eval` re-parses around this text. */
  depth: number;
  /** Index just past the scan (past the closing `)` when inside `$( )`). */
  end: number;
  /**
   * The text ran out inside a quote, after a lone trailing `\`, or inside an
   * unclosed `$( )` / backtick, so the shell would read on past it.
   */
  open: boolean;
};

/**
 * Deepest nesting of command substitutions and `eval` re-parses the clamp
 * reads. Real commands stay far below it; past it the clamp refuses rather
 * than recurse without bound (a stack overflow can take the process down).
 */
const MAX_NESTING = 64;

/** Thrown when a command nests past `MAX_NESTING`. */
class NestedTooDeep extends Error {}

/**
 * How the tokenizer reads syntax dash and bash disagree on. dash reads
 * here-docs, and `$'` as a `$` then a single-quoted string. bash reads `$'…'`
 * as ANSI-C quoting (`\` escapes, even `\'`), and may read the lines after
 * `<<` as code (`(( x << 2 ))` is arithmetic there): `hereDocs` false reads
 * `<<` as a plain redirection.
 */
type Reading = { hereDocs: boolean; ansiC: boolean };
const DASH: Reading = { hereDocs: true, ansiC: false };
const BASH: Reading = { hereDocs: true, ansiC: true };
const BASH_CODE: Reading = { hereDocs: false, ansiC: true };

/** A here-doc (`<<` / `<<-`) whose body starts after the next newline. */
type HereDoc = {
  delim: string;
  stripTabs: boolean;
  literal: boolean;
  /** Its redirection marker, which gets the body once it is read. */
  tok: Redir;
};

/** Index after the backtick closing the one at `open`, or -1 when none does. */
function matchBacktick(s: string, open: number): number {
  for (let k = open + 1; k < s.length; k++) {
    if (s[k] === "\\") {
      k++;
      continue;
    }
    if (s[k] === "`") return k + 1;
  }
  return -1;
}

/**
 * Tokenize the command substitution at `at` (`$(` or a backtick) onto `subs`
 * and return the index after it, or -1 when it never closes (the body then
 * runs to the end of `s`). A `$( )` body is tokenized in place, so its closing
 * `)` is found with quotes, comments and here-docs read the way the shell
 * reads them, and each character is tokenized once.
 */
function captureSubstitution(
  s: string,
  at: number,
  subs: Lexed[],
  reading: Reading,
  depth: number,
): number {
  if (s[at] === "`") {
    const end = matchBacktick(s, at);
    const body = s.slice(at + 1, end < 0 ? s.length : end - 1);
    const inner = tokenize(body, reading, depth + 1);
    if (end < 0) inner.open = true;
    subs.push(inner);
    return end;
  }
  const inner = tokenize(s, reading, depth + 1, at + 2, true);
  subs.push(inner);
  return inner.open ? -1 : inner.end;
}

/**
 * Tokenize the `$( )` / backtick substitutions of an unquoted here-doc body
 * onto `subs`: the shell expands them, so they run as commands. `\` escapes
 * the next character.
 */
function hereDocSubstitutions(
  body: string,
  subs: Lexed[],
  reading: Reading,
  depth: number,
): void {
  for (let k = 0; k < body.length; k++) {
    const c = body[k]!;
    if (c === "\\") {
      k++;
      continue;
    }
    if ((c === "$" && body[k + 1] === "(") || c === "`") {
      const end = captureSubstitution(body, k, subs, reading, depth);
      if (end < 0) return;
      k = end - 1;
    }
  }
}

/**
 * Quote-aware tokenizer that reads a command the way dash does. Splits `cmd`
 * into fragments (one simple command each) at unquoted control operators
 * (`; & | newline ( )`), tokenizes each fragment into words + redirection
 * markers, and records whether a word carries a shell expansion (`$` /
 * `$(…)` / backtick). A `\`-newline outside single quotes is a line
 * continuation (an escaped `\` before a newline is not), `#` at the start of a
 * word comments to the end of the line, and a here-doc body is data, apart
 * from the substitutions an unquoted one expands. Every command substitution
 * is tokenized in place and kept in `subs` for analysis. `reading` picks
 * how `$'` and `<<` are read (see `Reading`). With `inSubst` the scan starts
 * just inside a `$(` at `from` and stops after its `)`.
 */
function tokenize(
  cmd: string,
  reading: Reading,
  depth: number,
  from = 0,
  inSubst = false,
): Lexed {
  if (depth > MAX_NESTING) throw new NestedTooDeep();
  const n = cmd.length;
  const frags: Tok[][] = [];
  const subs: Lexed[] = [];
  let cur: Tok[] = [];
  let value = "";
  let expands = false;
  let quoted = false;
  let start = -1; // where the current word began; -1 between words
  let parens = 0; // bare `(` nesting inside a `$( )` body
  // The next word is a here-doc delimiter (true: `<<-`) for `docTok`.
  let delimNext: boolean | null = null;
  let docTok: Redir = { redir: "heredoc" };
  // Here-docs whose body starts after the next newline.
  const pending: HereDoc[] = [];

  const beginWord = (at: number) => {
    if (start < 0) start = at;
  };
  const endWord = () => {
    if (start >= 0) {
      if (delimNext != null) {
        pending.push({
          delim: value,
          stripTabs: delimNext,
          literal: quoted,
          tok: docTok,
        });
        delimNext = null;
      }
      cur.push({ word: { value, expands, start } });
    }
    value = "";
    expands = false;
    quoted = false;
    start = -1;
  };
  const endFrag = () => {
    endWord();
    delimNext = null;
    frags.push(cur);
    cur = [];
  };
  /** Take the substitution at `at` into the current word; -1 when unclosed. */
  const substitution = (at: number): number => {
    beginWord(at);
    expands = true;
    const end = captureSubstitution(cmd, at, subs, reading, depth);
    value += cmd.slice(at, end < 0 ? n : end);
    return end;
  };
  /** Skip the bodies of pending here-docs, which start at `i`. */
  const readHereDocs = (i: number): number => {
    for (const doc of pending.splice(0)) {
      const bodyStart = i;
      let bodyEnd = n;
      while (i < n) {
        const nl = cmd.indexOf("\n", i);
        const next = nl < 0 ? n : nl + 1;
        const line = cmd.slice(i, nl < 0 ? n : nl);
        if ((doc.stripTabs ? line.replace(/^\t+/, "") : line) === doc.delim) {
          bodyEnd = i;
          i = next;
          break;
        }
        i = next;
      }
      const body = cmd.slice(bodyStart, bodyEnd);
      doc.tok.doc = {
        body: doc.stripTabs ? body.replace(/^\t+/gm, "") : body,
        literal: doc.literal,
      };
      if (!doc.literal) hereDocSubstitutions(body, subs, reading, depth);
    }
    return i;
  };

  let open = false;
  let i = from;
  scan: while (i < n) {
    const c = cmd[i]!;

    if (c === "\\") {
      if (cmd[i + 1] === "\n") {
        i += 2; // line continuation
        continue;
      }
      beginWord(i);
      quoted = true;
      if (i + 1 >= n) {
        open = true; // lone trailing backslash
        break;
      }
      value += cmd[i + 1];
      i += 2;
      continue;
    }
    if (c === "'") {
      beginWord(i);
      quoted = true;
      const close = cmd.indexOf("'", i + 1);
      if (close < 0) {
        value += cmd.slice(i + 1);
        open = true;
        break;
      }
      value += cmd.slice(i + 1, close);
      i = close + 1;
      continue;
    }
    if (c === '"') {
      beginWord(i);
      quoted = true;
      i++;
      while (i < n && cmd[i] !== '"') {
        const d = cmd[i]!;
        if (d === "\\" && cmd[i + 1] === "\n") {
          i += 2; // line continuation
          continue;
        }
        if (d === "\\" && i + 1 < n && '"$`\\'.includes(cmd[i + 1]!)) {
          value += cmd[i + 1];
          i += 2;
          continue;
        }
        // A here-doc delimiter is not expanded: `$(` / backtick stay literal.
        if (
          delimNext == null &&
          ((d === "$" && cmd[i + 1] === "(") || d === "`")
        ) {
          const end = substitution(i);
          if (end < 0) {
            open = true;
            break scan;
          }
          i = end;
          continue;
        }
        if (d === "$") expands = true;
        value += d;
        i++;
      }
      if (i >= n) {
        open = true; // unterminated double quote
        break;
      }
      i++;
      continue;
    }
    if (c === " " || c === "\t") {
      endWord();
      i++;
      continue;
    }
    if (c === "#" && start < 0) {
      while (i < n && cmd[i] !== "\n") i++; // comment runs to the newline
      continue;
    }
    if (c === "\n") {
      endFrag();
      i = readHereDocs(i + 1);
      continue;
    }
    if (c === ";") {
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
    if (c === "(") {
      if (inSubst) parens++;
      endFrag();
      i++;
      continue;
    }
    if (c === ")") {
      endFrag();
      i++;
      if (inSubst) {
        if (parens === 0) {
          return { text: cmd, frags, subs, depth, end: i, open: false };
        }
        parens--;
      }
      continue;
    }
    if (c === "&") {
      if (cmd[i + 1] === ">") {
        // bash `&>` / `&>>` redirection.
        endWord();
        i += 2;
        if (cmd[i] === ">") i++;
        cur.push({ redir: "out" });
        continue;
      }
      endFrag();
      i++;
      if (cmd[i] === "&") i++;
      continue;
    }
    if (c === ">" || c === "<") {
      // A leading all-digit word is the fd of this redirection, not a token.
      if (start >= 0 && /^\d+$/.test(value)) {
        value = "";
        expands = false;
        quoted = false;
        start = -1;
      } else {
        endWord();
      }
      i++;
      const d = cmd[i];
      if (reading.hereDocs && c === "<" && d === "<" && cmd[i + 1] !== "<") {
        // `<<` / `<<-` here-doc: the next word is its delimiter.
        i++;
        delimNext = cmd[i] === "-";
        if (delimNext) i++;
        docTok = { redir: "heredoc" };
        cur.push(docTok);
        continue;
      }
      if (c === "<" && d === "<" && cmd[i + 1] === "<") {
        i += 2; // `<<<` here-string: the next word is fed as input
        cur.push({ redir: "herestring" });
        continue;
      }
      let kind: RedirKind = c === ">" ? "out" : "in";
      if (c === "<" && d === ">") kind = "rw";
      if (c === "<" && d === "<") kind = "heredoc"; // `<<` read as code
      if (
        d === ">" ||
        d === "&" ||
        d === "|" ||
        (c === "<" && (d === ">" || d === "<"))
      ) {
        i++;
      }
      cur.push({ redir: kind });
      continue;
    }
    if (reading.ansiC && c === "$" && cmd[i + 1] === "'") {
      // bash `$'…'`: `\` escapes the next character, even a `'`.
      beginWord(i);
      quoted = true;
      let k = i + 2;
      let escaped = false;
      while (k < n && cmd[k] !== "'") {
        if (cmd[k] === "\\") {
          escaped = true;
          k++;
        }
        k++;
      }
      if (k >= n) {
        value += cmd.slice(i + 2);
        open = true;
        break;
      }
      value += cmd.slice(i + 2, k);
      // Escapes decode to text the clamp does not model: an expansion.
      if (escaped) expands = true;
      i = k + 1;
      continue;
    }
    if (
      delimNext == null &&
      ((c === "$" && cmd[i + 1] === "(") || c === "`")
    ) {
      const end = substitution(i);
      if (end < 0) {
        open = true;
        break;
      }
      i = end;
      continue;
    }
    beginWord(i);
    if (c === "$") expands = true;
    value += c;
    i++;
  }
  endFrag();
  // Inside `$( )`, running out of text means the `)` never came.
  return { text: cmd, frags, subs, depth, end: n, open: open || inSubst };
}

/** A redirection of a simple command, with its target word if it has one. */
type Redirection = { kind: RedirKind; target: Word | null; doc?: HereDocBody };

/** A simple command's words and its redirections. */
type Parts = { words: Word[]; redirs: Redirection[] };

/**
 * Split a fragment into its words and its redirections. A redirection's
 * target is the next word; a `<(…)` / `>(…)` process substitution leaves it
 * without one.
 */
function fragParts(frag: Tok[]): Parts {
  const words: Word[] = [];
  const redirs: Redirection[] = [];
  let pending: Redirection | null = null;
  for (const tk of frag) {
    if ("redir" in tk) {
      pending = { kind: tk.redir, target: null, doc: tk.doc };
      redirs.push(pending);
    } else if (pending) {
      pending.target = tk.word; // a redirection's target is not an argument
      pending = null;
    } else {
      words.push(tk.word);
    }
  }
  return { words, redirs };
}

/** Index of the command word, past prefix words and `NAME=value` assignments. */
function commandStart(words: Word[]): number {
  let i = 0;
  while (i < words.length) {
    const v = words[i]!.value;
    if (PREFIX_WORDS.has(v)) {
      i++;
      while (i < words.length && words[i]!.value.startsWith("-")) i++;
      continue;
    }
    if (v === "function") {
      i += 2; // `function name { … }`
      continue;
    }
    if (ASSIGNMENT.test(v)) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

/** Shells whose `-c` string runs as a command (matched by name or path). */
const SHELLS = new Set([
  "sh", "bash", "dash", "zsh", "ksh", "mksh", "ash", "yash", "posh",
]);

/** Shell options that take the next word as their argument. */
const SHELL_OPT_ARGS = new Set([
  "-o", "+o", "-O", "+O", "--rcfile", "--init-file",
]);

/** Shell options whose argument is a startup file the shell sources. */
const SHELL_RC_OPTS = new Set(["--rcfile", "--init-file"]);

/** Last path component (`/bin/sh` → `sh`). */
function baseName(v: string): string {
  return v.slice(v.lastIndexOf("/") + 1);
}

/**
 * A shell's options after the shell word at `k`: whether `-c` was given, the
 * startup files it is told to source, and the index of its first operand (the
 * `-c` string or a script file), or -1 when it reads its commands from
 * standard input (no operand, or `-s`). `-` ends the options like `--`, and
 * `o` / `O` in a cluster (`-eo pipefail`) take the next word.
 */
function shellArgs(
  words: Word[],
  k: number,
): { dashC: boolean; operand: number; rcFiles: Word[] } {
  let dashC = false;
  let dashS = false;
  const rcFiles: Word[] = [];
  let m = k + 1;
  for (; m < words.length; m++) {
    const v = words[m]!.value;
    if (v === "--" || v === "-") {
      m++;
      break;
    }
    if (SHELL_OPT_ARGS.has(v)) {
      m++;
      if (SHELL_RC_OPTS.has(v) && words[m]) rcFiles.push(words[m]!);
      continue;
    }
    if (/^[-+][A-Za-z]+$/.test(v)) {
      if (v[0] === "-" && v.includes("c")) dashC = true;
      if (v[0] === "-" && v.includes("s")) dashS = true;
      m += (v.slice(1).match(/[oO]/g) ?? []).length;
      continue;
    }
    if (v.startsWith("--")) continue; // --norc, --login, --posix …
    break;
  }
  const stdin = m >= words.length || (dashS && !dashC);
  return { dashC, operand: stdin ? -1 : m, rcFiles };
}

/**
 * Check the `-c` string of every shell named in `words` like an `eval`
 * argument. Any word counts, not just the command word, so a shell behind
 * `env`, `exec`, `nohup`, `timeout`, `xargs` or `find -exec` is seen too. A
 * `-c` string that would expand refuses.
 */
function shellScripts(
  words: Word[],
  evalCommand: (cmd: string) => string | null,
): string | null {
  for (let k = 0; k < words.length; k++) {
    if (!SHELLS.has(baseName(words[k]!.value))) continue;
    const { dashC, operand } = shellArgs(words, k);
    const script = words[operand];
    if (!dashC || !script) continue;
    if (script.expands) return script.value || "$(...)";
    const r = evalCommand(script.value);
    if (r != null) return r;
  }
  return null;
}

/**
 * The action of a `trap` command at `i`, which the shell runs later as a
 * command, or undefined when it only lists or resets traps.
 */
function trapAction(words: Word[], i: number): Word | undefined {
  let m = i + 1;
  if (words[m]?.value === "--") m++;
  const action = words[m];
  if (!action || !words[m + 1] || /^(-.*|\d+)$/.test(action.value)) {
    return undefined;
  }
  return action;
}

/** Options of an exec wrapper that take the next word as their argument. */
const WRAPPER_OPT_ARGS: Record<string, Set<string>> = {
  exec: new Set(["-a"]),
  env: new Set(["-u", "--unset"]),
  nice: new Set(["-n", "--adjustment"]),
  timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
  stdbuf: new Set(["-i", "-o", "-e", "--input", "--output", "--error"]),
  xargs: new Set([
    "-a", "-E", "-I", "-L", "-n", "-P", "-s", "-d", "--arg-file", "--eof",
    "--replace", "--max-lines", "--max-args", "--max-procs", "--max-chars",
    "--delimiter",
  ]),
  nohup: new Set(),
  setsid: new Set(),
  busybox: new Set(),
};

/**
 * Index of the command that the exec wrapper at `k` runs (`env X=1 ./x`,
 * `timeout 5 ./x`, `xargs -n1 ./x`, `busybox sh`), or -1 when `k` is not a
 * wrapper or its command cannot be read (`env -C`, `env -S`).
 */
function wrapped(words: Word[], k: number): number {
  const name = baseName(words[k]!.value);
  const optArgs = WRAPPER_OPT_ARGS[name];
  if (!optArgs) return -1;
  let m = k + 1;
  for (; m < words.length; m++) {
    const v = words[m]!.value;
    if (v === "--") {
      m++;
      break;
    }
    if (name === "env" && (v === "-" || ASSIGNMENT.test(v))) continue;
    if (!v.startsWith("-") || v === "-") break;
    if (name === "env" && /^(-C|--chdir|-S|--split-string)/.test(v)) return -1;
    if (optArgs.has(v)) m++; // the option's argument is the next word
  }
  if (name === "timeout") m++; // the duration
  return m < words.length ? m : -1;
}

/**
 * Indexes of the words that run as commands, starting at the command word
 * `i`: the command word, what exec wrappers around it run, and the command
 * after each `find … -exec` / `-execdir` / `-ok` / `-okdir`.
 */
function commandIndexes(words: Word[], i: number): number[] {
  const out: number[] = [];
  for (let k = i; k >= 0 && k < words.length; k = wrapped(words, k)) {
    out.push(k);
    if (baseName(words[k]!.value) === "find") {
      for (let m = k + 1; m + 1 < words.length; m++) {
        if (/^-(exec|execdir|ok|okdir)$/.test(words[m]!.value)) out.push(m + 1);
      }
    }
  }
  return out;
}

/** Commands that never write the files they name (builtins and readers). */
const READ_ONLY = new Set([
  "cat", "bat", "less", "more", "head", "tail", "wc", "ls", "stat", "file",
  "test", "[", "[[", "grep", "egrep", "fgrep", "rg", "diff", "cmp", "md5sum",
  "sha1sum", "sha256sum", "sha512sum", "readlink", "realpath", "dirname",
  "basename", "echo", "printf", "chmod", "shellcheck", "true", "false",
  "which", "type", "du", "cd", "pushd", "popd", "pwd", "export", "unset",
  "set", "sleep", "exit", "return", "shift", "wait",
]);

/** `git` subcommands that never write the files they name. */
const GIT_READ_ONLY = new Set([
  "add", "diff", "status", "log", "show", "blame", "ls-files", "grep",
  "commit", "push", "fetch", "rev-parse",
]);

/** Most directories tracked as places the shell may have `cd`'d to. */
const MAX_CWDS = 32;

/** Most script files, and most bytes of script text, read for one command. */
const MAX_SCRIPTS = 32;
const MAX_SCRIPT_BYTES = 1 << 20;

/** What one `firstDisallowedCd` call knows about the command as a whole. */
type Ctx = {
  root: string;
  /** The root and every in-root `cd` target reached from the dirs before. */
  cwds: string[];
  /** Set once `cwds` would grow past MAX_CWDS: script paths then refuse. */
  cwdsOverflow: boolean;
  /** Paths the command writes: output redirections, non-read-only args. */
  writes: string[];
  /** Each path a script was looked for at → the script word, for messages. */
  lookedUp: Map<string, string>;
  /** Script file → verdict (null: fine, or still being checked). */
  scripts: Map<string, string | null>;
  /** Bytes of script text read so far (at most MAX_SCRIPT_BYTES). */
  scriptBytes: number;
};

/** Note that the shell may now be in `target`, from any dir it may be in. */
function addCwd(ctx: Ctx, target: string): void {
  for (const c of ctx.cwds.slice()) {
    const d = isAbsolute(target) ? normalize(target) : resolve(c, target);
    if (ctx.cwds.includes(d)) continue;
    if (ctx.cwds.length >= MAX_CWDS) {
      ctx.cwdsOverflow = true;
      return;
    }
    ctx.cwds.push(d);
  }
}

/** Where a path word may point, from every dir the shell may be in. */
function candidates(ctx: Ctx, v: string): string[] {
  if (isAbsolute(v)) return [normalize(v)];
  return [...new Set(ctx.cwds.map((c) => resolve(c, v)))];
}

/**
 * Add what `text` writes to `ctx.writes`: output redirection targets, and the
 * arguments of every command that is not read-only (a script that a shell or
 * `.` runs and a command a wrapper runs are not writes). `eval` arguments,
 * `trap` actions and shell `-c` strings are read the same way.
 */
function collectWrites(text: string, ctx: Ctx, depth: number): void {
  const readings = [DASH];
  if (text.includes("$'")) readings.push(BASH);
  if (text.includes("<<")) readings.push(BASH_CODE);
  for (const reading of readings) {
    collectLexedWrites(tokenize(text, reading, depth), ctx);
  }
}

function collectLexedWrites(lx: Lexed, ctx: Ctx): void {
  const push = (w: Word) => {
    if (w.expands) return;
    ctx.writes.push(w.value);
    const eq = w.value.lastIndexOf("=");
    if (eq >= 0) ctx.writes.push(w.value.slice(eq + 1)); // `of=x`, `--out=x`
  };
  for (const frag of lx.frags) {
    const { words, redirs } = fragParts(frag);
    for (const r of redirs) {
      if ((r.kind === "out" || r.kind === "rw") && r.target) push(r.target);
    }
    const i = commandStart(words);
    if (!words[i]) continue;
    if (words[i]!.value === "eval") {
      const rest = words.slice(i + 1).map((w) => w.value).join(" ");
      collectWrites(rest, ctx, lx.depth + 1);
      continue;
    }
    if (words[i]!.value === "trap") {
      const action = trapAction(words, i);
      if (action) collectWrites(action.value, ctx, lx.depth + 1);
      continue;
    }
    const cmds = commandIndexes(words, i);
    for (let n = 0; n < cmds.length; n++) {
      const k = cmds[n]!;
      const end = cmds[n + 1] ?? words.length;
      const name = baseName(words[k]!.value);
      let from = k + 1;
      let read: Word[] = [];
      if (SHELLS.has(name)) {
        const { dashC, operand, rcFiles } = shellArgs(words, k);
        if (operand >= 0 && dashC) {
          collectWrites(words[operand]!.value, ctx, lx.depth + 1);
        }
        if (operand >= 0) from = operand + 1; // its script is read, not written
        read = rcFiles;
      } else if (name === "." || name === "source") {
        from = k + 2;
      } else if (
        READ_ONLY.has(name) ||
        (name === "git" && GIT_READ_ONLY.has(words[k + 1]?.value ?? ""))
      ) {
        continue;
      }
      for (let m = from; m < end; m++) {
        if (!read.includes(words[m]!)) push(words[m]!);
      }
    }
  }
  for (const sub of lx.subs) collectLexedWrites(sub, ctx);
}

/** A script the command runs in a shell: sourced, handed to a shell, or run. */
type ScriptRef = { word: Word; kind: "source" | "shell" | "exec" };

/** `BASH_ENV=file`: a startup file that a non-interactive bash sources. */
const BASH_ENV = /^BASH_ENV=/;

/**
 * First offending cd/pushd target in the scripts that the simple command at
 * `i` runs in a shell: a file sourced with `.` / `source`, named by
 * `BASH_ENV=` or by a shell's `--rcfile`; a file, here-doc or here-string a
 * shell reads its commands from; a file run by path that is a shell script.
 * A shell reading commands from anything else (a pipe, the standard input it
 * was started with, a process substitution) refuses: its script is unknown.
 */
function scriptRefs(
  parts: Parts,
  i: number,
  ctx: Ctx,
  scriptCommand: (text: string) => string | null,
): string | null {
  const { words, redirs } = parts;
  const refs: ScriptRef[] = [];
  for (const w of words) {
    if (!BASH_ENV.test(w.value)) continue;
    const value = w.value.slice("BASH_ENV=".length);
    if (value) refs.push({ word: { ...w, value }, kind: "source" });
  }
  const head = words[i]!;
  if (head.value === "." || head.value === "source") {
    const k = words[i + 1]?.value === "--" ? i + 2 : i + 1;
    if (!words[k]) return `${head.value} (script not named)`;
    refs.push({ word: words[k]!, kind: "source" });
  }
  for (const k of commandIndexes(words, i)) {
    const w = words[k]!;
    if (SHELLS.has(baseName(w.value))) {
      const { dashC, operand, rcFiles } = shellArgs(words, k);
      for (const rc of rcFiles) refs.push({ word: rc, kind: "source" });
      if (dashC) continue; // the -c string is checked like an eval argument
      if (operand >= 0) {
        refs.push({ word: words[operand]!, kind: "shell" });
        continue;
      }
      // The shell reads its commands from standard input: the last input
      // redirection of this command, or else whatever it inherited.
      const input = redirs.filter((r) => r.kind !== "out").at(-1);
      if (input?.kind === "heredoc") {
        // Read as code (no body), its lines are checked as commands anyway.
        const r = input.doc ? hereDocScript(input.doc, w.value, scriptCommand) : null;
        if (r != null) return r;
      } else if (input?.kind === "herestring" && input.target) {
        if (input.target.expands) {
          return `${input.target.value} (shell input would expand)`;
        }
        const r = scriptCommand(input.target.value);
        if (r != null) return r;
      } else if (input?.target) {
        refs.push({ word: input.target, kind: "shell" });
      } else {
        return `${w.value} (reads commands from standard input)`;
      }
    } else if (w.value.includes("/") && !w.expands) {
      refs.push({ word: w, kind: "exec" });
    }
  }
  for (const ref of refs) {
    const r = checkScript(ref, ctx, scriptCommand);
    if (r != null) return r;
  }
  return null;
}

/**
 * Check a here-doc a shell reads its commands from. The body of an unquoted
 * one is expanded first: `\$`, `` \` ``, `\\` and `\`-newline lose their
 * backslash, and a `$` or backtick left refuses (the text is not lexical).
 */
function hereDocScript(
  doc: HereDocBody,
  shell: string,
  scriptCommand: (text: string) => string | null,
): string | null {
  if (doc.literal) return scriptCommand(doc.body);
  let text = "";
  for (let k = 0; k < doc.body.length; k++) {
    const c = doc.body[k]!;
    const d = doc.body[k + 1];
    if (c === "\\" && d != null && "$`\\\n".includes(d)) {
      if (d !== "\n") text += d;
      k++;
      continue;
    }
    if (c === "$" || c === "`") return `${shell} (shell input would expand)`;
    text += c;
  }
  return scriptCommand(text);
}

/**
 * Check one script (see `scriptRefs`) from every dir the shell may be in.
 * It refuses when its path would expand, when this command writes it, when a
 * sourced or shell-run script does not exist, when it is too large or cannot
 * be read, or when its contents refuse. A file run by path that does not
 * exist yet (a program the command builds) or is not a shell script is left
 * alone.
 */
function checkScript(
  ref: ScriptRef,
  ctx: Ctx,
  scriptCommand: (text: string) => string | null,
): string | null {
  const v = ref.word.value;
  if (ref.word.expands || EXPANSION.test(v) || v.startsWith("~")) {
    return `${v} (script path would expand)`;
  }
  if (ctx.cwdsOverflow) return `${v} (too many directory changes to place it)`;
  let paths = candidates(ctx, v);
  if (!v.includes("/") && ref.kind !== "exec") {
    // A bare name: `.` searches PATH (bash then the cwd), a shell the cwd
    // and then PATH.
    const dirs = (process.env.PATH ?? "").split(":").filter(Boolean);
    const onPath = dirs.flatMap((d) => candidates(ctx, join(d, v)));
    paths = [...new Set([...paths, ...onPath])];
  }
  for (const p of paths) if (!ctx.lookedUp.has(p)) ctx.lookedUp.set(p, v);
  const written = new Set(ctx.writes.flatMap((w) => candidates(ctx, w)));
  if (paths.some((p) => written.has(p))) {
    return `${v} (script written by this command)`;
  }
  const files = paths.filter(isFile);
  if (files.length === 0) {
    return ref.kind === "exec" ? null : `${v} (script not found)`;
  }
  for (const file of files) {
    if (ctx.scripts.has(file)) {
      const seen = ctx.scripts.get(file) ?? null;
      if (seen != null) return seen;
      continue;
    }
    if (ctx.scripts.size >= MAX_SCRIPTS) return `${v} (too many scripts to check)`;
    ctx.scripts.set(file, null);
    const budget = MAX_SCRIPT_BYTES - ctx.scriptBytes;
    const text = readScript(file, ref.kind === "exec", budget);
    if (text === undefined) continue; // run by path, but not a shell script
    if (text !== null) ctx.scriptBytes += text.length;
    const r =
      text === null ? "(script too large or unreadable to check)" : scriptCommand(text);
    if (r != null) {
      const out = `${r} (in ${v})`;
      ctx.scripts.set(file, out);
      return out;
    }
  }
  return null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * A script file's text; `undefined` when `runByPath` and the file is not a
 * shell script (a binary, or `#!` naming another interpreter); null when it is
 * larger than `budget` bytes or cannot be read.
 */
function readScript(
  file: string,
  runByPath: boolean,
  budget: number,
): string | null | undefined {
  let fd: number | undefined;
  try {
    const size = statSync(file).size;
    const head = Buffer.alloc(Math.min(size, 8192));
    fd = openSync(file, "r");
    readSync(fd, head, 0, head.length, 0);
    if (runByPath && !isShellScript(head)) return undefined;
    if (size > budget) return null;
    return readFileSync(file, "utf8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Whether a file the shell executes runs as a shell script: its `#!` line
 * names a shell (directly, or through `env` / `busybox`), or it has no `#!`
 * line and is text (the shell then runs it itself).
 */
function isShellScript(head: Buffer): boolean {
  if (head[0] === 0x23 && head[1] === 0x21) {
    const argv = head.toString("latin1", 2).split("\n")[0]!.trim().split(/\s+/);
    let k = 0;
    while (["env", "busybox"].includes(baseName(argv[k] ?? ""))) {
      k++;
      while (argv[k] && (argv[k]!.startsWith("-") || ASSIGNMENT.test(argv[k]!))) k++;
    }
    return SHELLS.has(baseName(argv[k] ?? ""));
  }
  return !head.includes(0);
}

/**
 * First offending cd/pushd target within one simple command, else null.
 * `openText` is the tokenized text when this command is the one the text ran
 * out in (open quote, trailing `\`); a cd/pushd there refuses.
 */
function analyzeFragment(
  parts: Parts,
  ctx: Ctx,
  evalCommand: (cmd: string) => string | null,
  scriptCommand: (text: string) => string | null,
  openText: string | null,
): string | null {
  const words = parts.words;
  const i = commandStart(words);
  for (let k = 0; k <= i && k < words.length; k++) {
    if (DIRSTACK_WRITE.test(words[k]!.value)) return "$DIRSTACK";
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
  if (head.value === "trap") {
    // The action runs later as a command, like an `eval` argument.
    const action = trapAction(words, i);
    if (!action) return null;
    if (action.expands) return action.value || "$(...)";
    return evalCommand(action.value);
  }
  if (head.value === "alias") {
    // An alias can turn any later word into `cd`: the clamp does not follow.
    const def = words.slice(i + 1).find((w) => w.value.includes("="));
    return def ? `${def.value} (alias)` : null;
  }
  if (head.value !== "cd" && head.value !== "pushd") {
    return (
      shellScripts(words.slice(i), evalCommand) ??
      scriptRefs(parts, i, ctx, scriptCommand)
    );
  }

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
  // The shell would read on past the end of the text, so the clamp cannot
  // know the real target: refuse, naming the unresolved text.
  if (openText != null) return openText.slice((target ?? head).start).trim();
  if (target == null || target.value === "") {
    return "$HOME"; // bare `cd` (or only options) → home
  }
  if (target.value === "-") return "$OLDPWD";
  if (target.expands) return target.value; // $VAR / $(…) / backtick in target
  if (EXPANSION.test(target.value)) return target.value; // glob / brace / literal $
  if (isCdEscape(target.value, ctx.root)) return target.value;
  addCwd(ctx, target.value); // later script paths may be relative to it
  return null;
}

/**
 * First offending cd/pushd target in `cmd`, or null when every cd-like is safe.
 * Fail-closed: unparsable or expanded command words, `cd -`, expanded or
 * escaping targets, dir-stack writes, alias definitions, escaping cd inside
 * command substitutions, `eval` arguments, `trap` actions and shell `-c`
 * strings, and a cd/pushd left open by an unterminated quote or a trailing
 * `\` all refuse. Scripts the command runs in a shell (sourced, handed to a
 * shell, or run by path) are read and checked the same way, and refuse when
 * they cannot be: missing, too large, written by the command itself, or read
 * from an unknown input. Runtime hardening (`CDPATH=; readonly CDPATH`,
 * dropped `CDPATH`/`OLDPWD`) covers what a lexer cannot, so CDPATH is no
 * longer refused lexically.
 */
export function firstDisallowedCd(cmd: string, root: string): string | null {
  const rootAbs = resolve(root);
  const ctx: Ctx = {
    root: rootAbs,
    cwds: [rootAbs],
    cwdsOverflow: false,
    writes: [],
    lookedUp: new Map(),
    scripts: new Map(),
    scriptBytes: 0,
  };
  try {
    collectWrites(cmd, ctx, 0);
    const r = checkReadings(cmd, ctx, { bash: false, code: false }, 0);
    if (r != null) return r;
  } catch (e) {
    if (e instanceof NestedTooDeep) return "(nested too deeply to check)";
    throw e;
  }
  // A script checked before a later part of the command (or a script it ran)
  // was seen to write it, or before a later cd put it in reach.
  if (ctx.lookedUp.size === 0) return null;
  const written = new Set(ctx.writes.flatMap((w) => candidates(ctx, w)));
  for (const [path, v] of ctx.lookedUp) {
    if (written.has(path)) return `${v} (script written by this command)`;
  }
  return null;
}

/** Checks an `eval` argument or `-c` string found in a text at `depth`. */
type EvalCheck = (cmd: string, depth: number) => string | null;

/** Which bash passes an enclosing text already runs over this one. */
type Covered = { bash: boolean; code: boolean };

/**
 * `cmd` read as dash reads it and, where bash reads it differently, as bash
 * does: refuse if any reading does. A text holding `$'` gets a bash pass
 * (ANSI-C quoting) and one holding `<<` a bash pass with every line read as
 * code (`(( x << 2 ))` is arithmetic in bash). Quote removal can form either
 * inside an `eval` argument or a shell's `-c` string (`<''<`), so those are
 * checked the same way; `covered` skips a bash pass that an enclosing text's
 * pass already takes in, keeping the work polynomial.
 */
function checkReadings(
  cmd: string,
  ctx: Ctx,
  covered: Covered,
  depth: number,
): string | null {
  const bash = !covered.bash && cmd.includes("$'");
  const code = !covered.code && cmd.includes("<<");
  const inner = { bash: covered.bash || bash, code: covered.code || code };
  const r = analyzeLexed(tokenize(cmd, DASH, depth), ctx, (sub, d) =>
    checkReadings(sub, ctx, inner, d),
  );
  if (r != null) return r;
  if (bash) {
    const b = checkOne(cmd, ctx, BASH, depth);
    if (b != null) return b;
  }
  return code ? checkOne(cmd, ctx, BASH_CODE, depth) : null;
}

/** `cmd` under one bash reading, and every `eval` / `-c` string in it too. */
function checkOne(
  cmd: string,
  ctx: Ctx,
  reading: Reading,
  depth: number,
): string | null {
  return analyzeLexed(tokenize(cmd, reading, depth), ctx, (sub, d) =>
    checkOne(sub, ctx, reading, d),
  );
}

/** A script's text, checked as a new command after noting what it writes. */
function checkScriptText(text: string, ctx: Ctx, depth: number): string | null {
  collectWrites(text, ctx, depth);
  return checkReadings(text, ctx, { bash: false, code: false }, depth);
}

/** First offending cd/pushd target in a tokenized command or its subs. */
function analyzeLexed(
  lx: Lexed,
  ctx: Ctx,
  evalCommand: EvalCheck,
): string | null {
  // An `eval` argument or a script is read one level deeper than its text.
  const evalHere = (inner: string) => evalCommand(inner, lx.depth + 1);
  const scriptHere = (text: string) => checkScriptText(text, ctx, lx.depth + 1);
  for (let k = 0; k < lx.frags.length; k++) {
    // Only the last command can be the one the text ran out in.
    const openText = lx.open && k === lx.frags.length - 1 ? lx.text : null;
    const r = analyzeFragment(
      fragParts(lx.frags[k]!),
      ctx,
      evalHere,
      scriptHere,
      openText,
    );
    if (r != null) return r;
  }
  for (const sub of lx.subs) {
    const r = analyzeLexed(sub, ctx, evalCommand);
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
