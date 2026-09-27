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

/** A word, its expansion flag, and where it starts in the tokenized text. */
type Word = { value: string; expands: boolean; start: number };
type Tok = { redir: true } | { word: Word };

/**
 * A tokenized command: its simple commands, the command substitutions inside
 * it (each already tokenized), and where the scan stopped.
 */
type Lexed = {
  /** The text that word `start` offsets refer to. */
  text: string;
  frags: Tok[][];
  subs: Lexed[];
  /** Index just past the scan (past the closing `)` when inside `$( )`). */
  end: number;
  /**
   * The text ran out inside a quote, after a lone trailing `\`, or inside an
   * unclosed `$( )` / backtick, so the shell would read on past it.
   */
  open: boolean;
};

/** A here-doc (`<<` / `<<-`) whose body starts after the next newline. */
type HereDoc = { delim: string; stripTabs: boolean; literal: boolean };

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
  hereDocs: boolean,
): number {
  if (s[at] === "`") {
    const end = matchBacktick(s, at);
    const body = s.slice(at + 1, end < 0 ? s.length : end - 1);
    const inner = tokenize(body, hereDocs);
    if (end < 0) inner.open = true;
    subs.push(inner);
    return end;
  }
  const inner = tokenize(s, hereDocs, at + 2, true);
  subs.push(inner);
  return inner.open ? -1 : inner.end;
}

/**
 * Tokenize the `$( )` / backtick substitutions of an unquoted here-doc body
 * onto `subs`: the shell expands them, so they run as commands. `\` escapes
 * the next character.
 */
function hereDocSubstitutions(body: string, subs: Lexed[]): void {
  for (let k = 0; k < body.length; k++) {
    const c = body[k]!;
    if (c === "\\") {
      k++;
      continue;
    }
    if ((c === "$" && body[k + 1] === "(") || c === "`") {
      const end = captureSubstitution(body, k, subs, true);
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
 * is tokenized in place and kept in `subs` for analysis. With `hereDocs`
 * false, `<<` is an ordinary redirection and the lines after it are read as
 * commands (bash reads `(( x << 2 ))` as arithmetic, not a here-doc). With
 * `inSubst` the scan starts just inside a `$(` at `from` and stops after its
 * `)`.
 */
function tokenize(
  cmd: string,
  hereDocs: boolean,
  from = 0,
  inSubst = false,
): Lexed {
  const n = cmd.length;
  const frags: Tok[][] = [];
  const subs: Lexed[] = [];
  let cur: Tok[] = [];
  let value = "";
  let expands = false;
  let quoted = false;
  let start = -1; // where the current word began; -1 between words
  let depth = 0; // bare `(` nesting inside a `$( )` body
  // The next word is a here-doc delimiter (true: `<<-`).
  let delimNext: boolean | null = null;
  // Here-docs whose body starts after the next newline.
  const pending: HereDoc[] = [];

  const beginWord = (at: number) => {
    if (start < 0) start = at;
  };
  const endWord = () => {
    if (start >= 0) {
      if (delimNext != null) {
        pending.push({ delim: value, stripTabs: delimNext, literal: quoted });
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
    const end = captureSubstitution(cmd, at, subs, hereDocs);
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
      if (!doc.literal) {
        hereDocSubstitutions(cmd.slice(bodyStart, bodyEnd), subs);
      }
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
      if (inSubst) depth++;
      endFrag();
      i++;
      continue;
    }
    if (c === ")") {
      endFrag();
      i++;
      if (inSubst) {
        if (depth === 0) return { text: cmd, frags, subs, end: i, open: false };
        depth--;
      }
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
      if (hereDocs && c === "<" && d === "<" && cmd[i + 1] !== "<") {
        // `<<` / `<<-` here-doc: the next word is its delimiter.
        i++;
        delimNext = cmd[i] === "-";
        if (delimNext) i++;
        cur.push({ redir: true });
        continue;
      }
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
  return { text: cmd, frags, subs, end: n, open: open || inSubst };
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

/**
 * First offending cd/pushd target within one simple command, else null.
 * `openText` is the tokenized text when this command is the one the text ran
 * out in (open quote, trailing `\`); a cd/pushd there refuses.
 */
function analyzeFragment(
  words: Word[],
  root: string,
  evalCommand: (cmd: string) => string | null,
  openText: string | null,
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
  // The shell would read on past the end of the text, so the clamp cannot
  // know the real target: refuse, naming the unresolved text.
  if (openText != null) return openText.slice((target ?? head).start).trim();
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
 * escaping targets, dir-stack writes, escaping cd inside command
 * substitutions, and a cd/pushd left open by an unterminated quote or a
 * trailing `\` all refuse. Runtime hardening (`CDPATH=; readonly CDPATH`,
 * dropped `CDPATH`/`OLDPWD`) covers what a lexer cannot, so CDPATH is no longer
 * refused lexically.
 */
export function firstDisallowedCd(cmd: string, root: string): string | null {
  try {
    return checkReadings(cmd, root, false);
  } catch (e) {
    // Nesting deep enough to exhaust the stack cannot be checked: refuse.
    if (e instanceof RangeError) return "(nested too deeply to check)";
    throw e;
  }
}

/**
 * dash reads the lines after `<<` as a here-doc body, bash may read them as
 * commands (`(( x << 2 ))` is arithmetic there): refuse if either reading
 * does. Quote removal can form a `<<` (`<''<`) inside an `eval` argument that
 * the outer text lacks, so each `eval` is checked the same way. `covered`: an
 * enclosing text's code-only reading already takes in this one, so it is not
 * run again (keeping the work polynomial).
 */
function checkReadings(
  cmd: string,
  root: string,
  covered: boolean,
): string | null {
  const both = !covered && cmd.includes("<<");
  const r = analyzeLexed(tokenize(cmd, true), root, (inner) =>
    checkReadings(inner, root, covered || both),
  );
  if (r != null || !both) return r;
  return checkCodeOnly(cmd, root);
}

/** `cmd` with `<<` read as a plain redirection and every line as code. */
function checkCodeOnly(cmd: string, root: string): string | null {
  return analyzeLexed(tokenize(cmd, false), root, (inner) =>
    checkCodeOnly(inner, root),
  );
}

/** First offending cd/pushd target in a tokenized command or its subs. */
function analyzeLexed(
  lx: Lexed,
  root: string,
  evalCommand: (cmd: string) => string | null,
): string | null {
  for (let k = 0; k < lx.frags.length; k++) {
    // Only the last command can be the one the text ran out in.
    const openText = lx.open && k === lx.frags.length - 1 ? lx.text : null;
    const r = analyzeFragment(
      stripRedirections(lx.frags[k]!),
      root,
      evalCommand,
      openText,
    );
    if (r != null) return r;
  }
  for (const sub of lx.subs) {
    const r = analyzeLexed(sub, root, evalCommand);
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
