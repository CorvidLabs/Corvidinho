/**
 * AGENT-18.a: `shell-exec` never approves, reviews or finalizes a SpecSync
 * change (REQ-plugins-1818).
 *
 * On Corvidinho the agent approves and archives its own change only in
 * `runTask`'s settle step right after a green lane (REQ-agent-519), where the
 * SpecSync plugin spawns `specsync` itself, never through a shell; in every
 * other repo a human approves, reviews and finalizes. So the shell refuses
 * `specsync change approve|review|finalize|ship` in every repo, with no repo
 * check, before anything is spawned (exit 2, `HUMAN_LIFECYCLE_LINE`).
 *
 * Read over the SAFE-21 ground (one walker, {@link forEachSimpleCommand}):
 * the dash and bash readings, `eval` / `trap` / shell `-c` strings, command
 * substitutions, and the in-root scripts a command runs in a shell (`sh x.sh`,
 * `. ./x.sh`, `./x.sh`). In each simple command an invocation starts at any
 * word named `specsync` (by basename, so an absolute or relative path; an
 * npm-style `specsync@<version>` too), so every exec wrapper (`env`,
 * `timeout`, `nohup`, `xargs`, `sudo` …), package runner (`bunx`, `npx` …)
 * and `find -exec` in front of it is covered; also at a command word that is
 * a link to the specsync binary, or that expands (`$S change approve c1`).
 * A glob or brace pattern (an unquoted `*`, `?`, `[`, `{`: `spec*ync`,
 * `appr?ve`, `fin{alize,}`) is read as every word it may stand for, so one
 * that may be `specsync`, `change` or a step counts as it. Its `change`
 * subcommand's step is read past SpecSync's options, failing closed: a word
 * right after an option may be the option's value or the step, so a
 * lifecycle step there counts; a step that expands, or one `xargs` supplies
 * from its input, refuses. So does a subcommand that expands or is a
 * pattern (`specsync "$@"`, `change${IFS}approve`, a function forwarding its
 * arguments), and one `xargs` supplies (`… | xargs specsync`, a replace
 * string); a command word that expands may be `xargs`. Those subcommand
 * rules skip an expanding command word's arguments and a `specsync` that is
 * only an argument of a command that never runs its arguments
 * (`grep -l specsync "$f"`).
 *
 * Residual (stated in the spec): code an interpreter runs (`bun -e`,
 * `node -e`, `python -c`, a script handed to `node` / `python`, the
 * `node-exec` / `python-exec` / `cargo-exec` runners) that spawns specsync
 * itself is not parsed; neither are package-manager scripts, make / just
 * recipes and git aliases, a copy of the binary under another name, a shell
 * alias for it, or a bash extended glob (`@(…)` with `extglob` on).
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { HUMAN_LIFECYCLE_LINE } from "../../src/agent/repo-ways.ts";
import type { PluginHandlerResult } from "../../src/plugins/types.ts";
import {
  commandChain,
  forEachSimpleCommand,
  type SimpleCommand,
  type Word,
} from "./clamp.ts";

/** The `specsync change` steps a human takes (on Corvidinho, the run's own settle step). */
export const HUMAN_LIFECYCLE_STEPS: readonly string[] = ["approve", "review", "finalize", "ship"];
const STEPS = new Set(HUMAN_LIFECYCLE_STEPS);

/**
 * The other `specsync change` subcommands (`specsync change --help`, 6.0).
 * Only read when `xargs` feeds the invocation: there a step outside this
 * list may be a replace string the input fills in.
 */
const OTHER_STEPS = new Set([
  "new", "answer", "depend", "supersede", "list", "show", "status",
  "ship-status", "reopen", "correct", "correct-owner", "check", "audit",
  "adopt", "help",
]);

/**
 * `specsync`'s subcommands (`specsync --help`, 6.0). Only read when `xargs`
 * feeds the invocation: there a subcommand outside this list may be a
 * replace string the input fills in.
 */
const SUBCOMMANDS = new Set([
  "check", "coverage", "generate", "init", "score", "watch", "mcp",
  "add-spec", "scaffold", "init-registry", "resolve", "diff", "hooks",
  "agents", "compact", "archive-tasks", "view", "merge", "issues", "new",
  "wizard", "deps", "import", "stale", "report", "comment", "rules",
  "changelog", "rehash", "migrate", "lifecycle", "change", "help",
]);

/**
 * Commands that never run their arguments: a `specsync` among them is only
 * text, so the subcommand after it is not read as failing closed (a
 * `change` step still refuses).
 */
const NEVER_RUN = new Set([
  "echo", "printf", "grep", "egrep", "fgrep", "rg", "cat", "head", "tail",
  "wc", "ls", "which", "type", "file", "stat", "readlink", "realpath",
  "basename", "dirname", "test", "[", "diff", "cmp", "du",
]);

/** One refused invocation: its step, the words as written, and where it is. */
export type LifecycleStep = {
  /** `approve`, `review`, `finalize` or `ship`; null when the step can't be read. */
  step: string | null;
  /** Why the step can't be read (null when `step` is set). */
  unread: string | null;
  /** The invocation's words, from the word naming specsync. */
  text: string;
  /** The in-root script it was found in, or null for the typed command. */
  script: string | null;
};

function baseName(v: string): string {
  return v.slice(v.lastIndexOf("/") + 1);
}

/** Longest pattern read as a pattern; a longer one may stand for anything. */
const MAX_PATTERN = 1024;
/** Most words a brace pattern is expanded to; past it, it may stand for anything. */
const MAX_BRACE_WORDS = 64;

/**
 * The words bash's brace expansion makes of `p`: `{a,b}` alternatives (nested
 * too) expanded, a sequence (`{1..9}`, `{a..z}`) read as `*`, and a brace
 * with neither (`{}`, `{a}`) kept as text. Null past MAX_BRACE_WORDS.
 */
function braceWords(p: string): string[] | null {
  for (let i = p.indexOf("{"); i >= 0; i = p.indexOf("{", i + 1)) {
    let depth = 0;
    let close = -1;
    const commas: number[] = [];
    for (let q = i; q < p.length && close < 0; q++) {
      if (p[q] === "{") depth++;
      else if (p[q] === "}" && --depth === 0) close = q;
      else if (p[q] === "," && depth === 1) commas.push(q);
    }
    if (close < 0) continue;
    const body = p.slice(i + 1, close);
    let alts: string[];
    if (commas.length > 0) {
      alts = [i, ...commas].map((c, n) => p.slice(c + 1, n < commas.length ? commas[n] : close));
    } else if (/^(-?\d+|[A-Za-z])\.\.(-?\d+|[A-Za-z])(\.\.-?\d+)?$/.test(body)) {
      alts = ["*"];
    } else {
      continue;
    }
    const out: string[] = [];
    for (const a of alts) {
      const more = braceWords(p.slice(0, i) + a + p.slice(close + 1));
      if (more == null || out.push(...more) > MAX_BRACE_WORDS) return null;
    }
    return out;
  }
  return [p];
}

/** A glob read for matching: `*`, `?` (and a bracket expression), or a literal character. */
const STAR = 0;
const ONE = 1;
type GlobTok = typeof STAR | typeof ONE | string;

/** Where the bracket expression opened at `i` closes, or -1 (then `[` is text). */
function bracketEnd(p: string, i: number): number {
  let q = i + 1;
  if (p[q] === "!" || p[q] === "^") q++;
  if (p[q] === "]") q++;
  while (q < p.length) {
    const kind = p[q + 1] ?? "";
    if (p[q] === "[" && kind && ":=.".includes(kind)) {
      const end = p.indexOf(`${kind}]`, q + 2); // `[:alpha:]`, `[=a=]`, `[.a.]`
      if (end >= 0) {
        q = end + 2;
        continue;
      }
    }
    if (p[q] === "]") return q;
    q++;
  }
  return -1;
}

/** `p` as glob tokens; a bracket expression is read as any one character. */
function globToks(p: string): GlobTok[] {
  const toks: GlobTok[] = [];
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    const end = c === "[" ? bracketEnd(p, i) : -1;
    if (c === "*") {
      if (toks.at(-1) !== STAR) toks.push(STAR);
    } else if (c === "?") {
      toks.push(ONE);
    } else if (end > i) {
      toks.push(ONE);
      i = end;
    } else {
      toks.push(c);
    }
  }
  return toks;
}

/** Whether the glob `toks` matches all of `s` (backtracking only to the last `*`). */
function globMatches(toks: readonly GlobTok[], s: string): boolean {
  let p = 0;
  let i = 0;
  let star = -1;
  let mark = 0;
  while (i < s.length) {
    const t = toks[p];
    if (t !== undefined && t !== STAR && (t === ONE || t === s[i])) {
      p++;
      i++;
    } else if (t === STAR) {
      star = p++;
      mark = i;
    } else if (star >= 0) {
      p = star + 1;
      i = ++mark;
    } else {
      return false;
    }
  }
  while (toks[p] === STAR) p++;
  return p === toks.length;
}

/** How a pattern word may stand for a name: not at all, by wildcards alone, or with literal text. */
type PatternMatch = "no" | "wild" | "text";

/**
 * Whether the pattern word `w` (`w.glob`) may stand for one of `names`, each
 * brace word read through `part` (its basename, say) first. "text" when a
 * matching word holds a literal character, "wild" when only wildcards match.
 */
function patternMatch(
  w: Word,
  names: readonly string[],
  part: (v: string) => string = (v) => v,
): PatternMatch {
  if (w.expands || !w.glob) return "no";
  if (w.value.length > MAX_PATTERN) return "text";
  const words = braceWords(w.value);
  if (words == null) return "text";
  let found: PatternMatch = "no";
  for (const word of words) {
    const toks = globToks(part(word));
    if (!names.some((n) => globMatches(toks, n))) continue;
    if (toks.some((t) => typeof t === "string")) return "text";
    found = "wild";
  }
  return found;
}

/** A literal word that is one of `names`, or a pattern that may stand for one. */
function mayBe(w: Word, names: readonly string[]): boolean {
  if (w.expands) return false;
  return w.glob ? patternMatch(w, names) !== "no" : names.includes(w.value);
}

/** The program name a word gives: past an option's `=`, its basename, without `@version`. */
function programName(value: string): string {
  const v = value.startsWith("-") ? value.slice(value.indexOf("=") + 1) : value;
  const base = baseName(v);
  const at = base.indexOf("@", 1);
  return at > 0 ? base.slice(0, at) : base;
}

/**
 * `specsync`, `/usr/bin/specsync`, `./bin/specsync`, `specsync@6.0.0`,
 * `@scope/specsync@1`, and an option's value (`--bin=specsync`); for a
 * pattern (`spec*ync`, `./spec{sync,}`), how it may stand for one of them.
 */
function namesSpecsync(w: Word): PatternMatch {
  if (w.expands) return "no";
  if (w.glob) return patternMatch(w, ["specsync"], programName);
  return programName(w.value) === "specsync" ? "text" : "no";
}

/** `xargs` by basename; for a pattern (`xarg?`), how it may stand for it. */
function namesXargs(w: Word): PatternMatch {
  if (w.expands) return "no";
  if (w.glob) return patternMatch(w, ["xargs"], baseName);
  return baseName(w.value) === "xargs" ? "text" : "no";
}

/** A command word that is a path to an existing link whose target is named `specsync`. */
function linksToSpecsync(w: Word, cmd: SimpleCommand, root: string): boolean {
  if (w.expands || !w.value.includes("/")) return false;
  for (const dir of new Set([root, ...cmd.cwds])) {
    try {
      if (baseName(realpathSync(resolve(dir, w.value))) === "specsync") return true;
    } catch {
      // missing or unreadable: not a link we can follow
    }
  }
  return false;
}

/** True for an option word (`--root`, `-h`, `--format=json`), never an expansion. */
function isOption(w: Word): boolean {
  return !w.expands && w.value.startsWith("-") && w.value !== "-";
}

type Verdict = { step: string | null; unread: string | null };

/**
 * The lifecycle step of `change` at `j`, or null when it takes none: the
 * first word past its options, where a word right after an option (no `=`)
 * may be that option's value, so a lifecycle step there counts and the scan
 * goes on.
 */
function stepAfterChange(
  words: readonly Word[],
  j: number,
  fed: boolean,
  literalOnly: boolean,
): Verdict | null {
  let afterOpt = false;
  for (let m = j + 1; m < words.length; m++) {
    const w = words[m]!;
    if (isOption(w)) {
      afterOpt = w.value !== "--" && !w.value.includes("=");
      continue;
    }
    if (!w.expands && !w.glob && STEPS.has(w.value)) return { step: w.value, unread: null };
    if (mayBe(w, HUMAN_LIFECYCLE_STEPS)) {
      return { step: null, unread: "its step is a pattern the shell expands" };
    }
    if (afterOpt) {
      afterOpt = false;
      continue;
    }
    if (w.expands) return literalOnly ? null : { step: null, unread: "its step expands" };
    if (fed && !literalOnly && !OTHER_STEPS.has(w.value)) {
      return { step: null, unread: "xargs fills in its step from input" };
    }
    return null;
  }
  return fed && !literalOnly ? { step: null, unread: "xargs supplies its step from input" } : null;
}

/**
 * The lifecycle step of the invocation whose program word is at `k`, or
 * null: every `change` the subcommand scan reaches (past options and what
 * may be their values) is read. With `strictSub`, a word there that expands
 * or is a pattern may be `change` and its step (`"$@"`,
 * `change${IFS}approve`, `{change,approve}`), and under `xargs` the input
 * may supply the subcommand, so those fail closed.
 */
function invocationStep(
  words: readonly Word[],
  k: number,
  fed: boolean,
  literalOnly: boolean,
  strictSub: boolean,
): Verdict | null {
  let afterOpt = false;
  for (let m = k + 1; m < words.length; m++) {
    const w = words[m]!;
    if (isOption(w)) {
      afterOpt = w.value !== "--" && !w.value.includes("=");
      continue;
    }
    if (strictSub && w.expands) return { step: null, unread: "its subcommand expands" };
    if (strictSub && w.glob) {
      return { step: null, unread: "its subcommand is a pattern the shell expands" };
    }
    if (mayBe(w, ["change"])) {
      const v = stepAfterChange(words, m, fed, literalOnly);
      if (v) return v;
    }
    if (afterOpt) {
      afterOpt = false;
      continue;
    }
    // The subcommand: `change` (read above) or another one. Under `xargs` a
    // word that is no subcommand may be a replace string the input fills in.
    if (fed && strictSub && !SUBCOMMANDS.has(w.value)) {
      return { step: null, unread: "xargs fills in its subcommand from input" };
    }
    return null;
  }
  return fed && strictSub ? { step: null, unread: "xargs supplies its subcommand from input" } : null;
}

/** Show the invocation in a reason: at most 80 characters. */
function show(words: readonly Word[], k: number): string {
  const v = words
    .slice(k)
    .map((w) => w.value)
    .join(" ");
  const t = v.length > 80 ? `${v.slice(0, 77)}...` : v;
  return `\`${t}\``;
}

function commandStep(cmd: SimpleCommand, root: string): LifecycleStep | null {
  const words = cmd.words;
  if (cmd.start >= words.length) return null;
  const chain = commandChain(words, cmd.start).map((l) => l.k);
  const links = new Set(chain);
  let fed = false; // an `xargs` in front: it appends words from its input
  for (let k = cmd.start; k < words.length; k++) {
    const w = words[k]!;
    const link = links.has(k);
    const name = namesSpecsync(w);
    const named = name !== "no" || (link && linksToSpecsync(w, cmd, root));
    // An expanding command word may be specsync: only a literal step refuses.
    // The same holds for a pattern of wildcards alone (`cp * "$d"`) away from
    // a command word.
    const unknown = !named && link && w.expands;
    if (named || unknown) {
      const literalOnly = unknown || (name === "wild" && !link);
      // An argument of a command that never runs its arguments
      // (`grep -l specsync "$f"`) is only read for a literal `change` step.
      const owner = link ? undefined : words[chain.filter((j) => j < k).at(-1) ?? -1];
      const asText = owner != null && !owner.expands && !owner.glob && NEVER_RUN.has(baseName(owner.value));
      const v = invocationStep(words, k, fed, literalOnly, !literalOnly && !asText);
      if (v) return { ...v, text: show(words, k), script: cmd.script };
    }
    // `xargs` appends words from its input to the words after it; so may a
    // pattern that may be it, and a command word that expands.
    const xargs = namesXargs(w);
    if (xargs === "text" || (link && (xargs === "wild" || w.expands))) fed = true;
  }
  return null;
}

/**
 * The first `specsync change approve|review|finalize|ship` that `cmd`, run
 * by `shell-exec` from `root`, would run (see the module comment), else null.
 * Synchronous; no repo check: the shell refuses these in every repo.
 */
export function firstLifecycleStep(cmd: string, root: string): LifecycleStep | null {
  const rootAbs = resolve(root);
  let found = null as LifecycleStep | null;
  forEachSimpleCommand(cmd, rootAbs, (c) => {
    found = commandStep(c, rootAbs);
    return found ? "lifecycle" : null;
  });
  return found;
}

const VERBS: Record<string, string> = {
  approve: "approve",
  review: "record a review of",
  finalize: "finalize and archive",
  ship: "ship (finalize and archive)",
};

/**
 * `shell-exec refused (AGENT-18.a): <what>[ (in SCRIPT)]; <HUMAN_LIFECYCLE_LINE
 * without its "refused: ">`.
 */
export function lifecycleRefuseMessage(f: LifecycleStep): string {
  const where = f.script ? ` (in ${f.script})` : "";
  const what = f.step
    ? `${f.text} would ${VERBS[f.step] ?? f.step} a SpecSync change from the shell`
    : `${f.text} may approve, review or finalize a SpecSync change from the shell (${f.unread})`;
  const line = HUMAN_LIFECYCLE_LINE.replace(/^refused: /, "");
  return (
    `shell-exec refused (AGENT-18.a): ${what}${where}, which the shell never does in any repo; ` +
    `${line}, through its own settle step and never the shell`
  );
}

/**
 * `shell-exec`'s refusal for a command holding a SpecSync lifecycle step:
 * exit 2, nothing spawned, `data.rule` "AGENT-18.a". Null when it holds none.
 */
export function lifecycleRefusal(cmd: string, root: string): PluginHandlerResult | null {
  const rootAbs = resolve(root);
  const f = firstLifecycleStep(cmd, rootAbs);
  if (f == null) return null;
  const msg = lifecycleRefuseMessage(f);
  return {
    ok: false,
    error: msg,
    message: msg,
    exitCode: 2,
    data: { refused: true, rule: "AGENT-18.a", step: f.step, script: f.script, root: rootAbs },
  };
}
