/**
 * SAFE-4: the shell and the language runners never wipe or overwrite
 * Corvidinho's own store (REQ-plugins-404).
 *
 * SAFE-4 ("Destructive data ops (raw SQL wipes, memory deletes) need a
 * two-phase confirm so a single confused tool call cannot erase the store")
 * is met for memories by `memory-forget` / `memory-override` and their
 * two-phase confirm (REQ-plugins-011). A shell or runner call has no second
 * phase, so a call on the store is refused before anything is spawned, with
 * those tools named instead.
 *
 * The store is the data dir `resolveDataDir` names (`CORVIDINHO_DATA_DIR`,
 * else `~/.local/share/corvidinho`) and everything in it — `corvidinho.db`
 * and its `-wal` / `-shm` / `-journal` siblings included — as written and
 * with symlinks resolved. When the project root sits inside the data dir,
 * only the DB file family counts, so the shell still works there.
 *
 * `shell-exec` ({@link storeRefusal}, after SAFE-21 and before the SAFE-3
 * clamp) reads the command over the SAFE-21 ground (one walker,
 * {@link forEachSimpleCommand}), with every command an exec wrapper or
 * `find -exec` runs ({@link commandChain}):
 *
 * - naming: a command that names the store refuses — a word that lands in
 *   it (as written, after `~`, `$HOME`, `$CORVIDINHO_DATA_DIR` or another
 *   variable set in the env, or through a symlink: a worktree link to the
 *   data dir included), text that spells it, an assignment or redirection
 *   pointing into it (in-root scripts included), and code handed to a SQL
 *   client or an interpreter, or put in a variable, that names
 *   `CORVIDINHO_DATA_DIR`. Read-only looks (`ls`, `stat`, `du`, `cat`,
 *   `sha256sum`, `rg` without `--pre` …) are let through. A SQL client
 *   (`sqlite3` …) on the store refuses for reads too: the check can't tell
 *   its reads from its writes.
 * - fail closed: a SQL client's words and input (its here-docs and
 *   here-strings, the files it reads, the commands piped into it), and a
 *   write command's target (`truncate`, `fallocate`, the `cp` / `install` /
 *   `rsync` destination, `dd of=`, the `tar -x` / `unzip` directory), refuse
 *   when they expand to anything but `~`, `$HOME` or `$CORVIDINHO_DATA_DIR`
 *   (those too once the command re-assigns them), come from `xargs`' input,
 *   are a pattern that can match the store, can't be walked, or are what a
 *   `find` that can reach the store finds; a tree copied into a directory
 *   that holds the store refuses.
 *
 * The runners ({@link runnerStoreRefusal}): any argv word that names the
 * store or the data dir (its text, or a path leading into it) refuses.
 *
 * Residual (stated in the spec): a store path a program builds at runtime
 * (a command substitution or a variable filled from program output, handed
 * to a command outside the SQL-client and write families; code that joins
 * it), code that reaches the store without naming it (a script file handed
 * to an interpreter, a module it imports, a package script or `make` /
 * `just` recipe the command runs), and an in-root script's output
 * redirection to an expanded path (as for the SAFE-21 edit family).
 */

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { PluginHandlerResult } from "../../src/plugins/types.ts";
import { defaultDbPath, resolveDataDir } from "../../src/store/paths.ts";
import {
  commandChain,
  forEachSimpleCommand,
  physicalPath,
  type ChainLink,
  type SimpleCommand,
  type Word,
} from "./clamp.ts";
import { globMatches } from "./footguns.ts";

export type StoreGuardOptions = {
  /** Env the store is resolved from (`CORVIDINHO_DATA_DIR`, `HOME`); defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Home dir (`~`); defaults to `env.HOME`, else the OS home. */
  home?: string;
};

/** One refusal: why, and the in-root script it was found in (null for the typed command). */
export type StoreHit = { why: string; script: string | null };

/** What to do instead: the two-phase memory tools. */
export const STORE_INSTEAD =
  "change or forget stored memories only with memory-forget or memory-override, whose " +
  "two-phase confirm (a token the owner sends back in a new message) keeps a single call " +
  "from erasing the store";

/** The DB file and the siblings SQLite keeps beside it. */
const DB_SUFFIXES = ["", "-wal", "-shm", "-journal"];

/** Characters that continue a file name: a spelling followed or led by one is another name. */
const NAME_CHAR = /[A-Za-z0-9_.-]/;

/** Variables `expand` resolves strictly (the rest fail closed). */
const KNOWN_VARS = new Set(["HOME", "CORVIDINHO_DATA_DIR"]);

const VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

/** `NAME=value` / `NAME+=value`. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;

/** Glob characters (a brace counts as an expansion the check can't follow). */
const GLOB = /[*?[]/;

/** Most bytes of a file a SQL client reads that are scanned for the store. */
const MAX_SCAN_BYTES = 1 << 20;
/** Most files read per command. */
const MAX_SCAN_FILES = 32;
/** Most path-like tokens read from one piece of code. */
const MAX_TOKENS = 512;

/** SQL clients: on the store they refuse for reads too (reads and writes look alike). */
const SQL_CLIENTS = new Set([
  "sqlite3", "sqlite", "sqlite3_rsync", "sqlcipher", "sqlite-utils", "litecli", "duckdb",
]);

/** Interpreters: their words are code, where `CORVIDINHO_DATA_DIR` names the store. */
const INTERPRETER =
  /^(python[0-9.]*|pypy[0-9.]*|node|nodejs|bun|deno|perl[0-9.]*|ruby[0-9.]*|php[0-9.]*|lua[0-9.]*|tsx|ts-node|[gmn]?awk)$/;

/**
 * Shells, `eval` and `trap`: the walker reads the code they run (`-c`
 * strings, `eval` words, trap actions, in-root scripts, here-docs), so their
 * own words are not read as names; what is piped into them still is.
 */
const WALKED = new Set([
  "sh", "bash", "dash", "zsh", "ksh", "mksh", "ash", "yash", "posh", "eval", "trap",
]);

/**
 * Read-only looks: they may name the store. Not `xxd` (its second operand is
 * an output file), `tree -o` or `less -o` / `--log-file` (they write one), and
 * `rg` only without `--pre` (which runs a command on every file it searches).
 */
const READERS = new Set([
  "ls", "stat", "du", "df", "file", "wc", "head", "tail", "cat", "tac", "more",
  "od", "hexdump", "strings", "cmp", "diff", "md5sum", "sha1sum", "sha224sum",
  "sha256sum", "sha384sum", "sha512sum", "b2sum", "cksum", "sum", "readlink", "realpath",
  "basename", "dirname", "echo", "printf", "test", "[", "[[", "true", "false", "cd",
  "pushd", "popd", "pwd", "printenv", "type", "which", "grep", "egrep", "fgrep", "rg",
]);

/** Declaration builtins: their `NAME=value` words assign like a prefix assignment. */
const DECLARE = new Set(["export", "declare", "typeset", "local", "readonly"]);

/** `find` actions that write or run something: without them `find` only looks. */
const FIND_ACTIONS = new Set([
  "-exec", "-execdir", "-ok", "-okdir", "-delete", "-fprint", "-fprint0", "-fprintf", "-fls",
]);

/** Commands whose targets are checked fail-closed (see {@link writerTargets}). */
const WRITERS = new Set(["truncate", "fallocate", "cp", "install", "dd", "rsync", "tar", "unzip"]);

type Store = {
  /** The data dir, resolved. */
  dir: string;
  /** The data dir as written and with symlinks resolved. */
  dirs: string[];
  /** The DB file family under each of `dirs`. */
  files: string[];
  /** The root is inside the data dir: only `files` count. */
  narrow: boolean;
  /** Texts that spell the store. */
  spellings: string[];
  home: string;
  env: NodeJS.ProcessEnv;
};

function baseName(v: string): string {
  return v.slice(v.lastIndexOf("/") + 1);
}

/** Show a word in a reason: at most 80 characters. */
function show(v: string): string {
  const t = v.length > 80 ? `${v.slice(0, 77)}...` : v;
  return `\`${t}\``;
}

function within(p: string, d: string): boolean {
  return p === d || p.startsWith(d.endsWith("/") ? d : `${d}/`);
}

function storeOf(root: string, opts: StoreGuardOptions): Store {
  const env = opts.env ?? process.env;
  const home = resolve(opts.home ?? env.HOME ?? homedir());
  const dir = resolve(resolveDataDir({ env, home }));
  const dirs = [dir];
  const real = physicalPath("/", dir);
  if (real && real !== dir) dirs.push(real);
  const db = basename(defaultDbPath({ env, home }));
  const files = dirs.flatMap((d) => DB_SUFFIXES.map((x) => join(d, db + x)));
  const rootAbs = resolve(root);
  const roots = [rootAbs, physicalPath("/", rootAbs) ?? rootAbs];
  const narrow = dirs.some((d) => d === "/" || roots.some((r) => within(r, d)));
  const spellings = new Set<string>();
  for (const p of narrow ? files : dirs) {
    spellings.add(p);
    const rel = relative(home, p);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
      spellings.add(`~/${rel}`);
      spellings.add(`$HOME/${rel}`);
      spellings.add(`\${HOME}/${rel}`);
      // `.local/share/corvidinho`: joined onto a home dir at runtime.
      if (rel.includes("/")) spellings.add(rel);
    }
  }
  return { dir, dirs, files, narrow, spellings: [...spellings], home, env };
}

/** True when the absolute path `p` is the store or in it. */
function inStore(p: string, s: Store): boolean {
  return s.narrow ? s.files.includes(p) : s.dirs.some((d) => within(p, d));
}

/** True when the absolute path `p` is the store, in it, or a directory that holds it. */
function reachesStore(p: string, s: Store): boolean {
  if (inStore(p, s)) return true;
  const pre = p.endsWith("/") ? p : `${p}/`;
  return (s.narrow ? s.files : s.dirs).some((q) => q.startsWith(pre));
}

/**
 * True when `text` spells the store (a spelling not run on into a longer
 * name), or — in `code` — names `CORVIDINHO_DATA_DIR`.
 */
function spells(text: string, s: Store, code: boolean): boolean {
  for (const sp of s.spellings) {
    for (let at = text.indexOf(sp); at >= 0; at = text.indexOf(sp, at + 1)) {
      const before = at > 0 ? text[at - 1]! : "";
      const after = text[at + sp.length] ?? "";
      if (!NAME_CHAR.test(before) && !NAME_CHAR.test(after)) return true;
    }
  }
  return code && /(^|[^A-Za-z0-9_])CORVIDINHO_DATA_DIR([^A-Za-z0-9_]|$)/.test(text);
}

type Expanded = { value: string; unknown: string | null };

/**
 * `v` as the shell expands it, as far as the check knows: a leading `~`,
 * `$HOME` / `$CORVIDINHO_DATA_DIR` (unset: empty), and any other variable the
 * env sets. `unknown` is the first part a strict check can't resolve:
 * another variable, a command substitution or other `$` / backtick
 * expansion, `~user`, or a known name the command re-assigns (`moved`).
 */
function expand(v: string, expands: boolean, s: Store, moved: ReadonlySet<string>): Expanded {
  let unknown: string | null = null;
  let out = v;
  if (out === "~" || out.startsWith("~/")) {
    if (moved.has("HOME")) unknown = "~";
    out = s.home + out.slice(1);
  } else if (out.startsWith("~")) {
    unknown = out.split("/")[0]!;
  }
  if (!expands) return { value: out, unknown };
  if (/[$`]/.test(v.replace(VAR_RE, ""))) unknown ??= v;
  out = out.replace(VAR_RE, (m, a, b) => {
    const name = (a ?? b) as string;
    if (KNOWN_VARS.has(name)) {
      if (moved.has(name)) unknown ??= m;
      return name === "HOME" ? s.home : (s.env.CORVIDINHO_DATA_DIR ?? "");
    }
    unknown ??= m;
    const val = s.env[name];
    return val != null && val !== "" ? val : m;
  });
  return { value: out, unknown };
}

/**
 * Where `piece` (expanded) lands from the dirs in `cwds`, as written or as
 * the kernel walks it, when `hit` says that is the store; else null. With
 * `failClosed`, a path that can't be walked (a loop, no permission) counts.
 */
function landsIn(
  piece: string,
  cwds: readonly string[],
  hit: (p: string) => boolean,
  failClosed = false,
): string | null {
  if (piece === "" || piece.length > 4096 || /[\n\0]/.test(piece)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(piece)) return null; // a URL, not a path
  for (const base of cwds) {
    const lexical = isAbsolute(piece) ? normalize(piece) : resolve(base, piece);
    if (hit(lexical)) return lexical;
    const real = physicalPath(base, piece);
    if (real == null ? failClosed : hit(real)) return real ?? lexical;
  }
  return null;
}

/** The path-like tokens of a piece of code or SQL (quoted names, `a/b`, `~/x`). */
function pathTokens(text: string): string[] {
  return text
    .split(/[\s'"`()[\]{},;=<>|&]+/)
    .filter((t) => t.includes("/") || t.startsWith("~"))
    .slice(0, MAX_TOKENS);
}

type Ctx = { s: Store; moved: ReadonlySet<string> };

/**
 * True when word `w`, run from `cwds`, names the store: its text spells it
 * (raw or expanded), it or a piece after `=` / `:` lands in it, or — for
 * text with spaces or `code` — one of its path-like tokens does.
 */
function wordNames(w: Word, cwds: readonly string[], c: Ctx, code: boolean): boolean {
  const { s } = c;
  const loose = expand(w.value, w.expands, s, new Set()).value;
  if (spells(w.value, s, code) || spells(loose, s, code)) return true;
  const pieces = new Set<string>();
  if (!/\s/.test(w.value)) {
    pieces.add(loose);
    for (const sep of ["=", ":"]) {
      const first = w.value.indexOf(sep);
      const last = w.value.lastIndexOf(sep);
      for (const at of [first, last]) {
        if (at >= 0) pieces.add(expand(w.value.slice(at + 1), w.expands, s, new Set()).value);
      }
    }
  }
  if (code || /\s/.test(w.value)) {
    for (const t of pathTokens(loose)) pieces.add(expand(t, false, s, new Set()).value);
  }
  for (const p of pieces) {
    if (landsIn(p, cwds, (x) => inStore(x, s))) return true;
  }
  return false;
}

/** The words of chain link `n`: from its command word to the next link. */
function linkWords(cmd: SimpleCommand, chain: readonly ChainLink[], n: number): Word[] {
  const end = chain[n + 1]?.k ?? cmd.words.length;
  return cmd.words.slice(chain[n]!.k, end) as Word[];
}

function isReader(name: string, words: readonly Word[]): boolean {
  if (name === "rg") return !words.some((w) => w.value === "--pre" || w.value.startsWith("--pre="));
  if (READERS.has(name)) return true;
  return name === "find" && !words.some((w) => FIND_ACTIONS.has(w.value));
}

/**
 * True when assignment `w` (`NAME=value`) points into the store, or its value
 * is code that names it (`CODE='…CORVIDINHO_DATA_DIR…'; python3 -c "$CODE"`).
 */
function assignmentNames(w: Word, cwds: readonly string[], c: Ctx): boolean {
  if (wordNames(w, cwds, c, false)) return true;
  const value = w.value.slice(w.value.indexOf("=") + 1);
  return wordNames({ ...w, value }, cwds, c, true);
}

/** `find`'s start paths (before its expression) and whether it follows symlinks. */
function findParts(words: readonly Word[]): { roots: Word[]; follows: boolean } {
  let m = 1;
  let follows = false;
  for (; m < words.length; m++) {
    const v = words[m]!.value;
    if (v === "-L" || v === "-follow") follows = true;
    if (/^-[HLP]$/.test(v) || /^-O\d?$/.test(v)) continue;
    if (v === "-D") {
      m++;
      continue;
    }
    break;
  }
  const roots: Word[] = [];
  for (; m < words.length; m++) {
    const v = words[m]!.value;
    if (v.startsWith("-") || v === "(" || v === "!" || v === ")" || v === ",") break;
    roots.push(words[m]!);
  }
  if (words.some((w) => w.value === "-follow")) follows = true;
  if (roots.length === 0) roots.push({ value: ".", expands: false, start: 0 });
  return { roots, follows };
}

/**
 * Why target `w` of `name` (from `cmd.cwds`) may be the store, failing
 * closed; `tree`: a directory that holds the store counts too.
 */
function targetWhy(name: string, w: Word, cmd: SimpleCommand, c: Ctx, tree: boolean): string | null {
  const { s } = c;
  const x = expand(w.value, w.expands, s, c.moved);
  if (x.unknown != null || w.value.includes("{")) {
    return (
      `the ${show(name)} target ${show(w.value)} expands when it runs, so it can't be shown ` +
      "to stay off Corvidinho's store"
    );
  }
  const v = x.value;
  const hit = tree ? (p: string) => reachesStore(p, s) : (p: string) => inStore(p, s);
  const glob = v.search(GLOB);
  if (glob >= 0) {
    const prefix = v.slice(0, v.lastIndexOf("/", glob) + 1) || ".";
    const pattern = `the ${show(name)} target ${show(w.value)} is a pattern that can match Corvidinho's store (${s.dir})`;
    // A pattern inside the store, or one that matches it now (as the shell expands it).
    if (landsIn(prefix, cmd.cwds, (p) => inStore(p, s), true)) return pattern;
    for (const base of cmd.cwds) {
      const matches = globMatches(v, base);
      if (matches.length >= 2000) return pattern;
      for (const m of matches) {
        if (landsIn(m, [base], hit, true)) return pattern;
      }
    }
    return null;
  }
  const at = landsIn(v, cmd.cwds, hit, true);
  if (at == null) return null;
  return inStore(at, s) || !tree
    ? `${show(name)} would write ${show(w.value)}, in Corvidinho's store (${s.dir})`
    : `${show(name)} copies a tree into ${show(w.value)}, which holds Corvidinho's store (${s.dir})`;
}

/** The operands of a command (options and the arguments of `argOpts` / `argLong` skipped). */
function operands(words: readonly Word[], argOpts: string, argLong: readonly string[]): Word[] {
  const out: Word[] = [];
  let ended = false;
  for (let m = 1; m < words.length; m++) {
    const w = words[m]!;
    const v = w.value;
    if (!ended && v === "--") {
      ended = true;
      continue;
    }
    if (!ended && v.startsWith("--")) {
      if (!v.includes("=") && argLong.includes(v)) m++;
      continue;
    }
    if (!ended && v.startsWith("-") && v !== "-") {
      if (argOpts.includes(v.at(-1)!) && v.length >= 2) m++; // `-s 0`: the next word is its argument
      continue;
    }
    out.push(w);
  }
  return out;
}

/** An option's value: `-t DIR`, `-tDIR`, `--target-directory DIR` / `=DIR`. */
function optValue(words: readonly Word[], short: string, long: string): Word | null {
  for (let m = 1; m < words.length; m++) {
    const w = words[m]!;
    const v = w.value;
    if (v === "--") break;
    if (v === `-${short}` || v === long) return words[m + 1] ?? null;
    if (v.startsWith(`${long}=`)) return { ...w, value: v.slice(long.length + 1) };
    if (!v.startsWith("--") && v.startsWith(`-${short}`) && v.length > 2) {
      return { ...w, value: v.slice(2) };
    }
  }
  return null;
}

type Targets = { targets: Word[]; tree: boolean; explicit: boolean };

/**
 * What a write command writes: its targets, whether it writes trees, and
 * whether the targets are named (not left to `xargs`' input).
 */
function writerTargets(name: string, words: readonly Word[]): Targets | null {
  const recursive = words.some((w) =>
    /^-[A-Za-z]*[rRa]/.test(w.value) && !w.value.startsWith("--")
      ? true
      : w.value === "--recursive" || w.value === "--archive",
  );
  switch (name) {
    case "truncate":
      return { targets: operands(words, "sr", ["--size", "--reference"]), tree: false, explicit: false };
    case "fallocate":
      return { targets: operands(words, "ol", ["--offset", "--length"]), tree: false, explicit: false };
    case "cp":
    case "install": {
      const t = optValue(words, "t", "--target-directory");
      if (t) return { targets: [t], tree: name === "cp" && recursive, explicit: true };
      const ops = operands(
        words,
        name === "cp" ? "S" : "Smogt",
        ["--suffix", "--mode", "--owner", "--group", "--strip-program"],
      );
      const dirs = name === "install" && words.some((w) => w.value === "-d" || w.value === "--directory");
      return {
        targets: dirs ? ops : ops.slice(-1),
        tree: name === "cp" && recursive,
        explicit: false,
      };
    }
    case "dd": {
      const of = words.find((w) => w.value.startsWith("of="));
      return {
        targets: of ? [{ ...of, value: of.value.slice(3) }] : [],
        tree: false,
        explicit: true,
      };
    }
    case "rsync":
      return {
        targets: operands(words, "eBfT", ["--rsh", "--filter", "--exclude", "--include"]).slice(-1),
        tree: true,
        explicit: false,
      };
    case "tar": {
      const first = words[1]?.value ?? "";
      const extracts =
        (/^[A-Za-z]+$/.test(first) && first.includes("x")) ||
        words.some((w) => /^-[A-Za-z]*x/.test(w.value) || w.value === "--extract" || w.value === "--get");
      if (!extracts) return null;
      const dir = optValue(words, "C", "--directory");
      return { targets: [dir ?? { value: ".", expands: false, start: 0 }], tree: true, explicit: true };
    }
    case "unzip": {
      const dir = optValue(words, "d", "-d");
      return { targets: [dir ?? { value: ".", expands: false, start: 0 }], tree: true, explicit: true };
    }
    default:
      return null;
  }
}

/** Why the `{}` targets of a command run by `find` (link `n`) may be the store. */
function findTargetWhy(cmd: SimpleCommand, chain: readonly ChainLink[], n: number, name: string, c: Ctx): string | null {
  let f = n - 1;
  while (f >= 0 && baseName(cmd.words[chain[f]!.k]!.value) !== "find") f--;
  if (f < 0) return null;
  const { roots, follows } = findParts(cmd.words.slice(chain[f]!.k));
  if (follows) {
    return `\`find -L\` / \`-follow\` follows symlinks, so what ${show(name)} runs on can reach Corvidinho's store`;
  }
  for (const r of roots) {
    const x = expand(r.value, r.expands, c.s, c.moved);
    if (
      x.unknown != null ||
      r.value.includes("{") ||
      GLOB.test(x.value) ||
      landsIn(x.value, cmd.cwds, (p) => reachesStore(p, c.s), true)
    ) {
      return `${show(name)} runs on what ${show(`find ${r.value}`)} finds, which can reach Corvidinho's store (${c.s.dir})`;
    }
  }
  return null;
}

/** Text a command is fed on its input: here-docs, here-strings. */
function inputTexts(cmd: SimpleCommand): { text: string; expands: boolean; label: string }[] {
  const out: { text: string; expands: boolean; label: string }[] = [];
  for (const r of cmd.redirs) {
    if (r.kind === "heredoc" && r.doc) {
      out.push({ text: r.doc.body, expands: !r.doc.literal, label: "a here-doc" });
    } else if (r.kind === "herestring" && r.target) {
      out.push({ text: r.target.value, expands: r.target.expands, label: show(`<<< ${r.target.value}`) });
    }
  }
  return out;
}

/** True when shell text that is expanded holds an expansion a strict check can't resolve. */
function textUnknown(text: string, c: Ctx): boolean {
  if (/[$`]/.test(text.replace(VAR_RE, ""))) return true;
  for (const m of text.matchAll(VAR_RE)) {
    const name = (m[1] ?? m[2])!;
    if (!KNOWN_VARS.has(name) || c.moved.has(name)) return true;
  }
  return false;
}

/** A small regular file's text, else null. */
function readSmall(path: string): string | null {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > MAX_SCAN_BYTES) return null;
    return readFileSync(path, "latin1");
  } catch {
    return null;
  }
}

/** The SQL a client reads from files (`-init`, `.read`, `< file`, `cat file |`) that names the store. */
function sqlFileWhy(name: string, words: readonly Word[], cmd: SimpleCommand, c: Ctx): string | null {
  const { s } = c;
  const candidates: string[] = [];
  const add = (w: Word) => {
    if (w.expands) return;
    for (const t of w.value.split(/\s+/)) if (t) candidates.push(t);
  };
  words.slice(1).forEach(add);
  for (const r of cmd.redirs) if (r.kind === "in" && r.target) add(r.target);
  for (const u of cmd.upstream) {
    u.words.forEach(add);
    for (const r of u.redirs) if (r.kind === "in" && r.target) add(r.target);
  }
  let read = 0;
  for (const t of candidates) {
    if (read >= MAX_SCAN_FILES) break;
    const v = expand(t, false, s, c.moved).value;
    for (const base of cmd.cwds) {
      const path = isAbsolute(v) ? normalize(v) : resolve(base, v);
      if (inStore(path, s)) continue;
      const text = readSmall(path);
      if (text == null) continue;
      read++;
      if (spells(text, s, true)) {
        return `${show(name)} reads ${show(t)}, which names Corvidinho's store (${s.dir})`;
      }
      break;
    }
  }
  return null;
}

/** Why the SQL client at chain link `n` may reach the store, fail-closed (see the module comment). */
function sqlWhy(cmd: SimpleCommand, chain: readonly ChainLink[], n: number, c: Ctx): string | null {
  const words = linkWords(cmd, chain, n);
  const name = baseName(words[0]!.value);
  const { via } = chain[n]!;
  if (via === "xargs") {
    return (
      `${show(`xargs ${name}`)} takes its database and SQL from its input, so they can't be ` +
      "shown to stay off Corvidinho's store"
    );
  }
  const expanded = (v: string, shown = show(v)) =>
    `${show(name)} is given ${shown}, which expands when it runs, so it can't be shown to stay ` +
    "off Corvidinho's store";
  for (const w of words.slice(1)) {
    if (via === "find" && w.value === "{}") {
      const why = findTargetWhy(cmd, chain, n, name, c);
      if (why) return why;
      continue;
    }
    if (expand(w.value, w.expands, c.s, c.moved).unknown != null) return expanded(w.value);
    if (!/\s/.test(w.value) && (GLOB.test(w.value) || w.value.includes("{"))) {
      const why = targetWhy(name, w, cmd, c, false);
      if (why) return why;
    }
  }
  // Its input: here-docs, here-strings, `<` files and what is piped into it.
  for (const r of cmd.redirs) {
    if ((r.kind === "in" || r.kind === "rw") && r.target) {
      if (expand(r.target.value, r.target.expands, c.s, c.moved).unknown != null) {
        return expanded(`< ${r.target.value}`);
      }
    }
  }
  for (const t of inputTexts(cmd)) {
    if (t.expands && textUnknown(t.text, c)) return expanded(t.label, t.label);
  }
  for (const u of cmd.upstream) {
    for (const w of u.words) {
      if (expand(w.value, w.expands, c.s, c.moved).unknown != null) {
        return `${show(name)} is fed ${show(w.value)}, which expands when it runs, so it can't be shown to stay off Corvidinho's store`;
      }
    }
  }
  return sqlFileWhy(name, words, cmd, c);
}

/** Why the command at chain link `n` names the store (`code`: its words are code). */
function linkNamesWhy(cmd: SimpleCommand, words: readonly Word[], c: Ctx, sql: boolean, code: boolean): string | null {
  const name = baseName(words[0]!.value);
  for (const w of words) {
    if (!wordNames(w, cmd.cwds, c, code)) continue;
    return sql
      ? `${show(name)} would open Corvidinho's store (${c.s.dir}) through ${show(w.value)}, and a SQL ` +
          "client there can wipe it (reads are refused too: the check can't tell them apart)"
      : `${show(name)} reaches Corvidinho's store (${c.s.dir}) through ${show(w.value)}`;
  }
  return null;
}

/** Why one simple command may wipe or overwrite the store, else null. */
function commandWhy(cmd: SimpleCommand, c: Ctx): string | null {
  const { s } = c;
  const words = cmd.words;
  // Assignments (`DB=…`, `X=… cmd`) pointing at the store.
  for (let i = 0; i < Math.min(cmd.start, words.length); i++) {
    const w = words[i]!;
    if (ASSIGNMENT.test(w.value) && assignmentNames(w, cmd.cwds, c)) {
      return `${show(w.value)} points a variable at Corvidinho's store (${s.dir})`;
    }
  }
  // Output redirections into the store (an in-root script's own included).
  for (const r of cmd.redirs) {
    if ((r.kind === "out" || r.kind === "rw") && r.target && wordNames(r.target, cmd.cwds, c, false)) {
      return `the redirection ${show(`${r.op} ${r.target.value}`)} writes into Corvidinho's store (${s.dir})`;
    }
  }
  if (cmd.start >= words.length) return null;
  const chain = commandChain(words, cmd.start);
  const last = chain.length - 1;
  for (let n = 0; n < chain.length; n++) {
    const lw = linkWords(cmd, chain, n);
    const name = baseName(lw[0]!.value);
    if (isReader(name, lw)) continue;
    if (DECLARE.has(name)) {
      const a = lw.slice(1).find((w) => ASSIGNMENT.test(w.value) && assignmentNames(w, cmd.cwds, c));
      if (a) return `${show(a.value)} points a variable at Corvidinho's store (${s.dir})`;
    }
    const sql = SQL_CLIENTS.has(name);
    const walked = WALKED.has(name);
    const code = sql || walked || INTERPRETER.test(name);
    const named = walked ? null : linkNamesWhy(cmd, lw, c, sql, code);
    if (named) return named;
    // What it is fed: input redirections, here-docs and here-strings, and
    // (for a SQL client or interpreter) the commands piped into it.
    if (n === last) {
      for (const r of cmd.redirs) {
        if ((r.kind === "in" || r.kind === "herestring") && r.target && wordNames(r.target, cmd.cwds, c, code)) {
          return `${show(name)} is fed ${show(r.target.value)}, which reaches Corvidinho's store (${s.dir})`;
        }
      }
      for (const t of inputTexts(cmd)) {
        const text = { value: t.text, expands: t.expands, start: 0 };
        if (wordNames(text, cmd.cwds, c, code)) {
          return `${show(name)} is fed text that names Corvidinho's store (${s.dir})`;
        }
      }
      if (code) {
        for (const u of cmd.upstream) {
          for (const w of u.words) {
            if (wordNames(w, cmd.cwds, c, true)) {
              return `${show(name)} is fed ${show(w.value)}, which names Corvidinho's store (${s.dir})`;
            }
          }
          for (const t of inputTexts(u)) {
            if (wordNames({ value: t.text, expands: t.expands, start: 0 }, cmd.cwds, c, true)) {
              return `${show(name)} is fed text that names Corvidinho's store (${s.dir})`;
            }
          }
        }
      }
    }
    if (sql) {
      const why = sqlWhy(cmd, chain, n, c);
      if (why) return why;
      continue;
    }
    if (!WRITERS.has(name)) continue;
    const t = writerTargets(name, lw);
    if (!t) continue;
    const { via } = chain[n]!;
    if (via === "xargs" && !t.explicit) {
      return (
        `${show(`xargs ${name}`)} takes its targets from its input, so they can't be shown to ` +
        "stay off Corvidinho's store"
      );
    }
    for (const w of t.targets) {
      const why =
        via === "find" && w.value === "{}"
          ? findTargetWhy(cmd, chain, n, name, c)
          : targetWhy(name, w, cmd, c, t.tree);
      if (why) return why;
    }
  }
  return null;
}

/** The names among HOME / CORVIDINHO_DATA_DIR that a command re-assigns, unsets or reads into. */
function movedNames(all: readonly SimpleCommand[]): Set<string> {
  const moved = new Set<string>();
  for (const cmd of all) {
    for (const w of cmd.words) {
      for (const name of KNOWN_VARS) {
        if (w.value === name || w.value.startsWith(`${name}=`) || w.value.startsWith(`${name}+=`)) {
          moved.add(name);
        }
      }
    }
  }
  return moved;
}

/**
 * The first way `cmd`, run by `shell-exec` from `root`, may wipe or
 * overwrite Corvidinho's store (see the module comment), else null.
 */
export function firstStoreHit(cmd: string, root: string, opts: StoreGuardOptions = {}): StoreHit | null {
  const rootAbs = resolve(root);
  const all: SimpleCommand[] = [];
  forEachSimpleCommand(cmd, rootAbs, (c) => {
    all.push(c);
    return null;
  });
  if (all.length === 0) return null;
  const c: Ctx = { s: storeOf(rootAbs, opts), moved: movedNames(all) };
  for (const one of all) {
    const why = commandWhy(one, c);
    if (why) return { why, script: one.script };
  }
  return null;
}

/** `shell-exec refused (SAFE-4): <why>[ (in SCRIPT)]; <STORE_INSTEAD>`. */
export function storeRefuseMessage(hit: StoreHit): string {
  const where = hit.script ? ` (in ${hit.script})` : "";
  return `shell-exec refused (SAFE-4): ${hit.why}${where}; ${STORE_INSTEAD}`;
}

/**
 * `shell-exec`'s refusal for a command that may wipe or overwrite the store:
 * exit 2, nothing spawned, `data.rule` "SAFE-4". Null when it can't.
 */
export function storeRefusal(cmd: string, root: string, opts: StoreGuardOptions = {}): PluginHandlerResult | null {
  const rootAbs = resolve(root);
  const hit = firstStoreHit(cmd, rootAbs, opts);
  if (hit == null) return null;
  const msg = storeRefuseMessage(hit);
  return {
    ok: false,
    error: msg,
    message: msg,
    exitCode: 2,
    data: { refused: true, rule: "SAFE-4", script: hit.script, root: rootAbs },
  };
}

/**
 * Why a language runner's argv (run from `root`) names Corvidinho's store
 * or its data dir — its text, or a path leading into it — else null.
 */
export function runnerStoreHit(args: readonly string[], root: string, opts: StoreGuardOptions = {}): string | null {
  const rootAbs = resolve(root);
  const c: Ctx = { s: storeOf(rootAbs, opts), moved: new Set() };
  for (const a of args) {
    if (wordNames({ value: String(a), expands: false, start: 0 }, [rootAbs], c, true)) {
      return `its argv names Corvidinho's store (${c.s.dir}) in ${show(String(a))}`;
    }
  }
  return null;
}

/**
 * A runner's refusal (`<runner> refused (SAFE-4): …`, exit 2, nothing
 * spawned, `data.rule` "SAFE-4") when its argv names the store, else null.
 */
export function runnerStoreRefusal(
  runner: string,
  args: readonly string[],
  root: string,
  opts: StoreGuardOptions = {},
): PluginHandlerResult | null {
  const why = runnerStoreHit(args, root, opts);
  if (why == null) return null;
  const msg = `${runner} refused (SAFE-4): ${why}; ${STORE_INSTEAD}`;
  return {
    ok: false,
    error: msg,
    message: msg,
    exitCode: 2,
    data: { refused: true, rule: "SAFE-4", runner, root: resolve(root) },
  };
}
