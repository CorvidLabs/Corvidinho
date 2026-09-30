/**
 * SAFE-21: `shell-exec` refuses foot-guns and says why (REQ-plugins-494).
 *
 * Four families, read over the same ground as the SAFE-3 clamp (one walker,
 * {@link forEachSimpleCommand}: dash and bash readings, `eval` / `trap` /
 * `-c` strings, command substitutions, and the in-root scripts a command
 * runs in a shell):
 *
 * - edit: `sed -i` / `--in-place`, and output redirections to anything but
 *   /dev/null, stdout, stderr or an fd dup. The typed command text only (its
 *   `eval` / `-c` strings and substitutions included); a project script's own
 *   redirections are a stated residual.
 * - download: a downloader (curl, wget, …) whose output is run as code: piped
 *   into a shell or interpreter (also through env / timeout / sudo / xargs),
 *   fed to one as `$(…)`, `<(…)` or an expanded string, or saved to a file the
 *   same command then runs.
 * - delete: `rm`, `rmdir`, `unlink`, `shred`, `find -delete` / `-exec rm`,
 *   `xargs rm`, `mv`, forced `ln` and `git worktree remove|prune` whose target
 *   is outside the worktree, as written or through a symlink; an expanded or
 *   input-fed target fails closed.
 * - secret: secret files (`isSecretPath`, unchanged), the host's credential
 *   stores (Corvidinho's env and allowlist files and config dir, gh, git
 *   credentials, netrc, ssh keys, `/proc/<pid>/environ`), `HEAD:.env`-style
 *   object paths, credential env vars, credential-printing commands
 *   (`gh auth token`, `git credential fill`), ssh-family commands (they use
 *   the owner's keys), and anything that would point git or gh back at the
 *   owner's credentials (SAFE-21.a).
 *
 * The download, delete and secret families also run over the in-root
 * scripts, so a script written with files-write and then run with `sh x.sh`
 * does not get past them.
 */

import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { isVerifyEnvDropped } from "../../src/agent/verify.ts";
import { resolveAllowlistPath } from "../../src/allowlist/load.ts";
import { isSecretPath } from "../files/protectedPaths.ts";
import { isCredentialEnvKey } from "../runners/commands.ts";
import {
  commandChain,
  forEachSimpleCommand,
  landsOutside,
  lnArgs,
  physicalPath,
  type ChainLink,
  type SimpleCommand,
  type Word,
} from "./clamp.ts";

export type FootgunRule = "edit" | "download" | "delete" | "secret";

/** One refusal: its family, why, what to do instead, and the script it is in. */
export type Footgun = {
  rule: FootgunRule;
  why: string;
  instead: string;
  /** The in-root script the command was found in, or null for the typed text. */
  script: string | null;
};

export type FootgunOptions = {
  /** Env the secret paths are read from (CORVIDINHO_ENV_FILE, XDG_CONFIG_HOME …). */
  env?: NodeJS.ProcessEnv;
  /** Home dir (`~`); defaults to `env.HOME`, else the OS home. */
  home?: string;
};

const INSTEAD: Record<FootgunRule, string> = {
  edit:
    "change files with files-write or files-edit, and send command output only to " +
    "/dev/null, stdout or stderr",
  download:
    "save the download to a file (curl -o FILE), read it, and run only code that is " +
    "checked into the worktree",
  delete:
    "delete or move only literal paths inside the worktree (files-delete, or " +
    "`find . … -delete` for many)",
  secret:
    "secrets stay out of the shell: use the typed tool that needs them (git-push, " +
    "github-*), or ask the owner",
};

/** `shell-exec refused (SAFE-21): <why>; <what to do instead>`. */
export function footgunRefuseMessage(f: Footgun): string {
  const where = f.script ? ` (in ${f.script})` : "";
  return `shell-exec refused (SAFE-21): ${f.why}${where}; ${f.instead}`;
}

/** Last path component (`/usr/bin/curl` → `curl`). */
function baseName(v: string): string {
  return v.slice(v.lastIndexOf("/") + 1);
}

const DOWNLOADERS = new Set([
  "curl", "wget", "wget2", "fetch", "aria2c", "http", "https", "xh", "xhs", "curlie",
]);

const SHELLS = new Set([
  "sh", "bash", "dash", "zsh", "ksh", "mksh", "ash", "yash", "posh",
]);

/**
 * Interpreters that run code from standard input when given no script: the
 * option letters that take code (`-c`, `-e`), and those that take another
 * argument (skipped) or name a module (`python -m`: not standard input).
 */
const INTERPRETERS: Record<string, { code: string; args: string; module: string }> = {
  python: { code: "c", args: "WXQ", module: "m" },
  python2: { code: "c", args: "WXQ", module: "m" },
  python3: { code: "c", args: "WXQ", module: "m" },
  pypy: { code: "c", args: "WXQ", module: "m" },
  pypy3: { code: "c", args: "WXQ", module: "m" },
  perl: { code: "eE", args: "", module: "" },
  ruby: { code: "e", args: "IrCEFX", module: "" },
  node: { code: "ep", args: "rC", module: "" },
  nodejs: { code: "ep", args: "rC", module: "" },
  php: { code: "r", args: "cdz", module: "" },
  lua: { code: "e", args: "l", module: "" },
};

/** Paths that are a process's own standard input. */
const STDIN_PATHS = new Set(["-", "/dev/stdin", "/dev/fd/0", "/proc/self/fd/0"]);

const DELETERS = new Set(["rm", "rmdir", "unlink", "shred"]);

/**
 * A path the shell expands in ways the checks cannot see: `$`, a backtick, or
 * a brace (bash brace expansion). Code strings go by `expands` alone, since a
 * program's own braces are not expanded when quoted.
 */
function dynamic(w: Word): boolean {
  return w.expands || w.value.includes("{");
}

/** Show a word in a reason: at most 80 characters. */
function show(v: string): string {
  const t = v.length > 80 ? `${v.slice(0, 77)}...` : v;
  return `\`${t}\``;
}

/** The words of chain link `n`: from its command word to the next link. */
function linkWords(cmd: SimpleCommand, chain: readonly ChainLink[], n: number): Word[] {
  const end = chain[n + 1]?.k ?? cmd.words.length;
  return cmd.words.slice(chain[n]!.k, end) as Word[];
}

function isDownloader(cmd: SimpleCommand): boolean {
  if (cmd.start >= cmd.words.length) return false;
  return commandChain(cmd.words, cmd.start).some((l) =>
    DOWNLOADERS.has(baseName(cmd.words[l.k]!.value)),
  );
}

// ---------------------------------------------------------------- edit (a)

/** `sed -i`, `-ni`, `-i.bak`, `--in-place[=SUF]` (or an abbreviation of it). */
function sedInPlace(words: readonly Word[]): boolean {
  for (let m = 1; m < words.length; m++) {
    const v = words[m]!.value;
    if (v === "--") return false;
    if (v.startsWith("--")) {
      const opt = v.split("=")[0]!;
      if (opt.length > 3 && "--in-place".startsWith(opt)) return true;
      continue;
    }
    if (/^-[A-Za-z]*i/.test(v)) return true;
    if (v === "-e" || v === "-f" || v === "-l") m++; // the option's argument
  }
  return false;
}

const OK_OUTPUT_TARGETS = new Set(["/dev/null", "/dev/stdout", "/dev/stderr"]);

function editFootgun(cmd: SimpleCommand): Footgun | null {
  if (cmd.script != null) return null; // typed text only (stated residual)
  for (const r of cmd.redirs) {
    if (r.kind !== "out" && r.kind !== "rw") continue;
    if (r.target == null) continue; // `>(…)`: a process, not a file
    const t = r.target;
    if (!t.expands && OK_OUTPUT_TARGETS.has(t.value)) continue;
    if ((r.op === ">&" || r.op === "<&") && !t.expands && /^(\d+|-)$/.test(t.value)) continue;
    return {
      rule: "edit",
      why: `the redirection ${show(`${r.op} ${t.value}`)} writes a file behind the file tools`,
      instead: INSTEAD.edit,
      script: null,
    };
  }
  if (cmd.start >= cmd.words.length) return null;
  const chain = commandChain(cmd.words, cmd.start);
  for (let n = 0; n < chain.length; n++) {
    const words = linkWords(cmd, chain, n);
    const name = baseName(words[0]!.value);
    const edit = (why: string, instead = INSTEAD.edit): Footgun => ({
      rule: "edit",
      why,
      instead,
      script: null,
    });
    if ((name === "sed" || name === "gsed") && sedInPlace(words)) {
      return edit(
        "`sed -i` edits files in place behind the file tools",
        `${INSTEAD.edit} (sed without -i only prints)`,
      );
    }
    // The same in-place edit spelled by another tool.
    if ((name === "perl" || name === "ruby") && inPlaceFlag(words)) {
      return edit(`\`${name} -i\` edits files in place behind the file tools`);
    }
    if (/^[gm]?awk$/.test(name) && awkInPlace(words)) {
      return edit(`\`${name} -i inplace\` edits files in place behind the file tools`);
    }
    // `tee FILE` / `sponge FILE` are a `>` redirection spelled as a command.
    if (name === "tee" || name === "sponge") {
      const file = words
        .slice(1)
        .find((w) => !w.value.startsWith("-") && !(OK_OUTPUT_TARGETS.has(w.value) && !w.expands));
      if (file) {
        return edit(`${show(`${name} ${file.value}`)} writes a file behind the file tools, like \`>\``);
      }
    }
  }
  return null;
}

/** `perl -i` / `-pi` / `-i.bak`, `ruby -i`: an option cluster holding `i` before the script. */
function inPlaceFlag(words: readonly Word[]): boolean {
  for (let m = 1; m < words.length; m++) {
    const v = words[m]!.value;
    if (v === "--" || !v.startsWith("-")) return false;
    if (v.startsWith("--")) continue;
    // `-e CODE` / `-I DIR` style options end the cluster; their argument is skipped.
    const cluster = v.slice(1);
    for (const ch of cluster) {
      if (ch === "i") return true;
      if ("eEIrlCFxX".includes(ch)) break;
    }
    if (/^-[eEIr]$/.test(v)) m++;
  }
  return false;
}

/** `awk -i inplace` / `--include=inplace` (gawk's in-place extension). */
function awkInPlace(words: readonly Word[]): boolean {
  for (let m = 1; m < words.length; m++) {
    const v = words[m]!.value;
    if ((v === "-i" || v === "--include") && /^inplace(\.awk)?$/.test(words[m + 1]?.value ?? "")) {
      return true;
    }
    if (/^(-i|--include=)inplace(\.awk)?$/.test(v)) return true;
  }
  return false;
}

// ------------------------------------------------------------ download (b)

/** Where a shell or interpreter at chain link `n` takes its code from. */
type CodeFrom =
  | { from: "stdin" }
  | { from: "dynamic"; word: string }
  | { from: "file"; path: string }
  | { from: "literal" }
  | { from: "none" };

/** A shell's code: its `-c` string, its script operand, or its input. */
function shellCode(cmd: SimpleCommand, words: readonly Word[]): CodeFrom {
  let dashC = false;
  let dashS = false;
  let m = 1;
  for (; m < words.length; m++) {
    const v = words[m]!.value;
    if (v === "--" || v === "-") {
      m++;
      break;
    }
    if (/^[-+](o|O)$/.test(v) || v === "--rcfile" || v === "--init-file") {
      m++;
      continue;
    }
    if (/^[-+][A-Za-z]+$/.test(v)) {
      if (v[0] === "-" && v.includes("c")) dashC = true;
      if (v[0] === "-" && v.includes("s")) dashS = true;
      m += (v.slice(1).match(/[oO]/g) ?? []).length;
      continue;
    }
    if (v.startsWith("--")) continue;
    break;
  }
  const operand = words[m];
  if (dashC) {
    if (!operand) return { from: "none" };
    return operand.expands ? { from: "dynamic", word: operand.value } : { from: "literal" };
  }
  if (operand && !dashS) return scriptFile(operand, cmd);
  return inputCode(cmd);
}

/** A script path operand: expanded, standard input (see {@link inputCode}), or a file. */
function scriptFile(w: Word, cmd: SimpleCommand): CodeFrom {
  if (w.expands) return { from: "dynamic", word: w.value };
  if (STDIN_PATHS.has(w.value)) return inputCode(cmd);
  return { from: "file", path: w.value };
}

/**
 * What a command reading its code from standard input reads: its last input
 * redirection (a here-doc or here-string, literal or expanded; a process
 * substitution; a file), else the pipe or input it inherited.
 */
function inputCode(cmd: SimpleCommand): CodeFrom {
  const input = cmd.redirs.filter((r) => r.kind !== "out").at(-1);
  if (!input) return { from: "stdin" };
  if (input.kind === "heredoc") {
    return input.doc && !input.doc.literal && /[$`]/.test(input.doc.body)
      ? { from: "dynamic", word: "<<" }
      : { from: "literal" };
  }
  if (input.target == null) return { from: "dynamic", word: `${input.op}(…)` };
  if (input.kind === "herestring") {
    return input.target.expands
      ? { from: "dynamic", word: input.target.value }
      : { from: "literal" };
  }
  if (input.target.expands) return { from: "dynamic", word: input.target.value };
  if (STDIN_PATHS.has(input.target.value)) return { from: "stdin" };
  return { from: "file", path: input.target.value };
}

/** An interpreter's code: a `-c` / `-e` string, a script, a module, or its input. */
function interpreterCode(cmd: SimpleCommand, words: readonly Word[]): CodeFrom {
  const spec = INTERPRETERS[baseName(words[0]!.value)]!;
  for (let m = 1; m < words.length; m++) {
    const w = words[m]!;
    const v = w.value;
    if (v === "-") return inputCode(cmd);
    if (v === "--") {
      const next = words[m + 1];
      return next ? scriptFile(next, cmd) : inputCode(cmd);
    }
    if (v.startsWith("--")) {
      const [opt, val] = [v.split("=")[0]!, v.includes("=") ? v.slice(v.indexOf("=") + 1) : null];
      if (opt === "--eval" || opt === "--print") {
        const code = val != null ? { ...w, value: val } : words[m + 1];
        if (!code) return { from: "none" };
        return code.expands ? { from: "dynamic", word: code.value } : { from: "literal" };
      }
      if (val == null && /^--(require|import|loader|experimental-loader|conditions)$/.test(opt)) m++;
      continue;
    }
    if (v.startsWith("-")) {
      for (let j = 1; j < v.length; j++) {
        const ch = v[j]!;
        const rest = v.slice(j + 1);
        if (spec.code.includes(ch)) {
          const code = rest ? { ...w, value: rest } : words[m + 1];
          if (!code) return { from: "none" };
          return code.expands ? { from: "dynamic", word: code.value } : { from: "literal" };
        }
        if (spec.module.includes(ch)) return { from: "literal" };
        if (spec.args.includes(ch)) {
          if (!rest) m++;
          break;
        }
      }
      continue;
    }
    return scriptFile(w, cmd);
  }
  return inputCode(cmd);
}

/** What the command at chain link `n` runs as code, when it is a shell, interpreter or `.`. */
function codeOf(cmd: SimpleCommand, chain: readonly ChainLink[], n: number): CodeFrom | null {
  const words = linkWords(cmd, chain, n);
  const name = baseName(words[0]!.value);
  if (SHELLS.has(name)) return shellCode(cmd, words);
  if (INTERPRETERS[name]) return interpreterCode(cmd, words);
  if (chain[n]!.k === cmd.start && (name === "." || name === "source")) {
    const k = words[1]?.value === "--" ? 2 : 1;
    return words[k] ? scriptFile(words[k]!, cmd) : inputCode(cmd);
  }
  if (chain[n]!.k === cmd.start && name === "eval") {
    const x = words.slice(1).find((w) => w.expands);
    return x ? { from: "dynamic", word: x.value } : { from: "literal" };
  }
  return null;
}

/**
 * True when a downloader in `all` names `path`: as an argument (`-o path`,
 * `-opath`, `--output=path`), as its output redirection, or as the last
 * component of a URL it fetches (`wget https://…/install.sh` saves
 * `install.sh`).
 */
function downloadWrites(all: readonly SimpleCommand[], path: string): boolean {
  const norm = normalize(path);
  const base = baseName(norm);
  const same = (v: string) => v === path || normalize(v) === norm;
  const urlFile = (v: string) => {
    if (!v.includes("://")) return false;
    const file = baseName(v.replace(/[?#].*$/, ""));
    return file !== "" && file === base;
  };
  return all.some(
    (c) =>
      isDownloader(c) &&
      (c.words.some((w) => {
        const v = w.value;
        if (same(v) || urlFile(v)) return true;
        const eq = v.indexOf("=");
        if (eq >= 0 && same(v.slice(eq + 1))) return true;
        return /^-[A-Za-z]*[oO].+/.test(v) && same(v.replace(/^-[A-Za-z]*[oO]/, ""));
      }) ||
        c.redirs.some((r) => r.kind === "out" && r.target != null && same(r.target.value))),
  );
}

function downloadFootgun(
  cmd: SimpleCommand,
  all: readonly SimpleCommand[],
  anyDownload: boolean,
): Footgun | null {
  if (!anyDownload || cmd.start >= cmd.words.length) return null;
  const chain = commandChain(cmd.words, cmd.start);
  const fedByDownload = cmd.upstream.some(isDownloader);
  for (let n = 0; n < chain.length; n++) {
    const raw = cmd.words[chain[n]!.k]!;
    const name = baseName(raw.value);
    const code = codeOf(cmd, chain, n);
    const viaXargs = chain.slice(0, n + 1).some((l) => l.via === "xargs");
    let why: string | null = null;
    // A shell fed a download is refused whatever it runs: its `-c` string can
    // hand that input on to another shell or interpreter.
    if (
      fedByDownload &&
      (code?.from === "stdin" || (code && viaXargs) || SHELLS.has(name))
    ) {
      why = `a download is piped into ${show(name)}, which runs it as code`;
    } else if (
      raw.value.includes("/") &&
      !raw.expands &&
      downloadWrites(all, raw.value)
    ) {
      // A downloaded file run by path (`curl -O …/i.sh; ./i.sh`).
      why = `${show(raw.value)} is run, and this command downloads it`;
    } else if (code?.from === "dynamic") {
      why =
        `${show(name)} runs code from ${show(code.word)}, which this command fills ` +
        "from a download";
    } else if (code?.from === "file" && downloadWrites(all, code.path)) {
      why = `${show(name)} runs ${show(code.path)}, which this command downloads`;
    }
    if (why) return { rule: "download", why, instead: INSTEAD.download, script: cmd.script };
  }
  return null;
}

// -------------------------------------------------------------- delete (c)

/** The operands of a delete command (options and their arguments skipped). */
function operands(words: readonly Word[], argOpts: RegExp, argLong: readonly string[]): Word[] {
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
      if (!v.includes("=") && argLong.some((o) => o.startsWith(v) && v.length > 3)) m++;
      continue;
    }
    if (!ended && v.startsWith("-") && v !== "-") {
      const hit = v.slice(1).search(argOpts);
      if (hit >= 0 && hit === v.length - 2) m++; // `-n 3`: the next word is its argument
      continue;
    }
    out.push(w);
  }
  return out;
}

/** What each delete-family command does to its targets, for the reason. */
const VERBS: Record<string, string> = {
  mv: "move",
  "ln -f": "replace",
  find: "delete under",
  "git worktree remove": "remove",
  "git worktree move": "move",
};

/** Glob characters the shell expands in a word (brace handled as dynamic). */
const GLOB = /[*?[]/;

/**
 * A glob component that could match `.` or `..` (`.*`, `.?`, `.[.]` …). A
 * leading `.` must be matched literally, so only a pattern starting with one
 * can.
 */
function globMatchesDots(component: string): boolean {
  if (!GLOB.test(component) || !component.startsWith(".")) return false;
  let re = "^";
  for (let k = 0; k < component.length; k++) {
    const c = component[k]!;
    if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else if (c === "[") {
      const close = component.indexOf("]", k + 2);
      if (close < 0) return true; // cannot read it: assume the worst
      let set = component.slice(k + 1, close);
      if (set.startsWith("!")) set = `^${set.slice(1)}`;
      re += `[${set.replace(/\\/g, "\\\\")}]`;
      k = close;
    } else re += c.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  re += "$";
  try {
    const rx = new RegExp(re);
    return rx.test(".") || rx.test("..");
  } catch {
    return true;
  }
}

/**
 * Why deleting `w` (from the dirs in `cmd.cwds`) may reach outside the
 * worktree, else null. `followsLinks`: the command acts on a symlink's target
 * (`shred`, `find -L`), so a glob that could match a link fails closed.
 * `startPath`: `w` is where the command starts (a `find` path), so the
 * worktree itself is fine; otherwise deleting the worktree's own directory
 * is refused too.
 */
function deleteTargetWhy(
  name: string,
  w: Word,
  cmd: SimpleCommand,
  root: string,
  followsLinks: boolean,
  startPath = false,
): string | null {
  const v = w.value;
  if (dynamic(w)) {
    return (
      `the ${show(name)} target ${show(v)} expands when it runs, so it can't be shown ` +
      "to stay inside the worktree"
    );
  }
  if (v === "") return null;
  const verb = VERBS[name] ?? "delete";
  if (v.startsWith("~")) return `${show(name)} would ${verb} ${show(v)} outside the worktree`;
  if (GLOB.test(v)) {
    const parts = v.split("/");
    const last = parts.at(-1)!;
    const firstGlob = parts.findIndex((p) => GLOB.test(p));
    if (
      parts.includes("..") ||
      firstGlob < parts.length - 1 ||
      globMatchesDots(last) ||
      followsLinks
    ) {
      return (
        `the ${show(name)} target ${show(v)} is a pattern that can match outside the ` +
        "worktree (through `..`, a symlink or a parent directory)"
      );
    }
    const dir = parts.slice(0, -1).join("/") || (v.startsWith("/") ? "/" : ".");
    return landsOutside(dir, root, cmd.cwds)
      ? `${show(name)} would ${verb} ${show(v)} outside the worktree`
      : null;
  }
  if (landsOutside(v, root, cmd.cwds)) {
    return `${show(name)} would ${verb} ${show(v)} outside the worktree (${root})`;
  }
  if (!startPath && landsOutside(v, root, cmd.cwds, false)) {
    return `${show(name)} would ${verb} ${show(v)}, the worktree itself`;
  }
  return null;
}

/** `find`'s start paths (before its expression) and whether it deletes or follows links. */
function findParts(words: readonly Word[]): {
  roots: Word[];
  deletes: boolean;
  follows: boolean;
} {
  const roots: Word[] = [];
  let m = 1;
  let follows = false;
  for (; m < words.length; m++) {
    const v = words[m]!.value;
    if (v === "-L" || v === "-follow") follows = true;
    if (/^-[HLP]$/.test(v)) continue;
    if (v === "-D" || v === "-O" || /^-O\d$/.test(v)) {
      if (v === "-D") m++;
      continue;
    }
    break;
  }
  for (; m < words.length; m++) {
    const v = words[m]!.value;
    if (v.startsWith("-") || v === "(" || v === "!" || v === ")" || v === ",") break;
    roots.push(words[m]!);
  }
  let deletes = false;
  for (let k = m; k < words.length; k++) {
    const v = words[k]!.value;
    if (v === "-follow") follows = true;
    if (v === "-delete") deletes = true;
    if (/^-(exec|execdir|ok|okdir)$/.test(v)) {
      const run = baseName(words[k + 1]?.value ?? "");
      if (DELETERS.has(run) || run === "mv") deletes = true;
    }
  }
  if (roots.length === 0) roots.push({ value: ".", expands: false, start: 0 });
  return { roots, deletes, follows };
}

/** `git`'s subcommand index and its `-C` / `--work-tree` / `--git-dir` dirs. */
function gitParts(words: readonly Word[]): { sub: number; dirs: Word[]; configs: Word[] } {
  const dirs: Word[] = [];
  const configs: Word[] = [];
  let m = 1;
  for (; m < words.length; m++) {
    const w = words[m]!;
    const v = w.value;
    if (v === "-C" || v === "--git-dir" || v === "--work-tree") {
      if (words[m + 1]) dirs.push(words[m + 1]!);
      m++;
      continue;
    }
    if (v === "-c" || v === "--config-env") {
      configs.push(words[m + 1] ?? { ...w, value: "" });
      if (v === "--config-env") configs.push(w);
      m++;
      continue;
    }
    if (v.startsWith("--git-dir=") || v.startsWith("--work-tree=")) {
      dirs.push({ ...w, value: v.slice(v.indexOf("=") + 1) });
      continue;
    }
    if (v.startsWith("--config-env")) {
      configs.push(w);
      continue;
    }
    if (v === "--namespace" || v === "--exec-path" || v === "--super-prefix") {
      m++;
      continue;
    }
    if (v.startsWith("-")) continue;
    break;
  }
  return { sub: m, dirs, configs };
}

/** git subcommands that delete or overwrite files in the work tree they run in. */
const GIT_DELETING = new Set([
  "clean", "rm", "mv", "worktree", "reset", "checkout", "restore", "switch", "stash",
]);

function deleteFootgun(cmd: SimpleCommand, root: string): Footgun | null {
  if (cmd.start >= cmd.words.length) return null;
  const chain = commandChain(cmd.words, cmd.start);
  const hit = (why: string): Footgun => ({
    rule: "delete",
    why,
    instead: INSTEAD.delete,
    script: cmd.script,
  });
  for (let n = 0; n < chain.length; n++) {
    const { via } = chain[n]!;
    const words = linkWords(cmd, chain, n);
    const name = baseName(words[0]!.value);
    const deleter = DELETERS.has(name) || name === "mv";
    if (deleter && via === "xargs") {
      return hit(
        `${show(`xargs ${name}`)} takes its targets from its input, so they can't be ` +
          "shown to stay inside the worktree",
      );
    }
    if (deleter) {
      // Under `find -exec` the `{}` targets are find's start paths (checked there).
      const own = via === "find" ? words.filter((w) => !/^(\{\}|;|\+)$/.test(w.value)) : words;
      const targets =
        name === "shred"
          ? operands(own, /[ns]/, ["--iterations", "--size", "--random-source"])
          : name === "mv"
            ? operands(own, /[tS]/, ["--target-directory", "--suffix"]).concat(
                mvTargetDir(own),
              )
            : operands(own, /$^/, []);
      if (name === "rmdir" && own.some((w) => /^-[A-Za-z]*p|^--parents$/.test(w.value))) {
        const up = targets.find((t) => isAbsolute(t.value) || t.value.split("/").includes(".."));
        if (up) return hit(`${show("rmdir -p")} would also remove the parents of ${show(up.value)}`);
      }
      for (const t of targets) {
        const why = deleteTargetWhy(name, t, cmd, root, name === "shred");
        if (why) return hit(why);
      }
      continue;
    }
    if (name === "find") {
      // find's expression runs on past its `-exec` command.
      const f = findParts(cmd.words.slice(chain[n]!.k));
      if (!f.deletes) continue;
      if (f.follows) {
        // `find -L` / `-follow` walks into symlinked dirs, so what it deletes
        // can sit outside the worktree whatever its start paths are.
        return hit(
          "`find -L` / `-follow` follows symlinks, so its deletes can reach outside the worktree",
        );
      }
      for (const r of f.roots) {
        const why = deleteTargetWhy("find", r, cmd, root, f.follows, true);
        if (why) return hit(why);
      }
      continue;
    }
    if (
      name === "rsync" &&
      words.some((w) => /^--(del|delete\S*|remove-source-files)$|^--delete/.test(w.value))
    ) {
      // `rsync --delete*` removes at its destination, `--remove-source-files`
      // at its sources: every operand must stay inside.
      for (const t of operands(words, /[eBfT]/, ["--rsh", "--filter", "--exclude", "--include"])) {
        const why = deleteTargetWhy("rsync", t, cmd, root, false, true);
        if (why) return hit(why);
      }
      continue;
    }
    if (name === "ln") {
      const a = lnArgs(words, 0, words.length);
      if (!a.force || !a.dest) continue;
      const why = deleteTargetWhy("ln -f", a.dest, cmd, root, false);
      if (why) return hit(why);
      continue;
    }
    if (name === "git") {
      const g = gitParts(words);
      const sub = words[g.sub]?.value ?? "";
      if (GIT_DELETING.has(sub)) {
        for (const d of g.dirs) {
          if (dynamic(d) || landsOutside(d.value, root, cmd.cwds)) {
            return hit(
              `${show(`git ${sub}`)} would run on ${show(d.value)}, outside the worktree`,
            );
          }
        }
      }
      if (sub !== "worktree") continue;
      const rest = words.slice(g.sub + 1).filter((w) => !w.value.startsWith("-"));
      const action = rest[0]?.value;
      if (action === "prune") {
        return hit(
          "`git worktree prune` prunes worktree records shared with other talks, outside " +
            "this worktree",
        );
      }
      if (action === "remove" || action === "move") {
        if (g.dirs.length > 0) {
          return hit(`${show(`git -C … worktree ${action}`)} can't be placed inside the worktree`);
        }
        for (const p of rest.slice(1)) {
          const why = deleteTargetWhy(`git worktree ${action}`, p, cmd, root, false);
          if (why) return hit(why);
        }
      }
    }
  }
  return null;
}

/** `mv -t DIR` / `--target-directory=DIR`: the destination is an operand too. */
function mvTargetDir(words: readonly Word[]): Word[] {
  const out: Word[] = [];
  for (let m = 1; m < words.length; m++) {
    const w = words[m]!;
    const v = w.value;
    if (v === "--") break;
    if (v === "-t" || v === "--target-directory") {
      if (words[m + 1]) out.push(words[m + 1]!);
      m++;
    } else if (/^-[A-Za-z]*t.+/.test(v) && !v.startsWith("--")) {
      out.push({ ...w, value: v.slice(v.indexOf("t") + 1) });
    } else if (v.startsWith("--target-directory=")) {
      out.push({ ...w, value: v.slice("--target-directory=".length) });
    }
  }
  return out;
}

// -------------------------------------------------------------- secret (d)

/** A secret location on the host: a file, or a dir and everything in it. */
type SecretPlace = { path: string; dir: boolean; what: string };

/** The host's secret places, as written and with symlinks resolved. */
function secretPlaces(env: NodeJS.ProcessEnv, home: string): SecretPlace[] {
  const out: SecretPlace[] = [];
  const add = (p: string | undefined, dir: boolean, what: string) => {
    if (!p) return;
    const abs = resolve(home, p.startsWith("~/") ? join(home, p.slice(2)) : p === "~" ? home : p);
    out.push({ path: abs, dir, what });
    const real = physicalPath("/", abs);
    if (real && real !== abs) out.push({ path: real, dir, what });
  };
  const configs = [join(home, ".config")];
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg && isAbsolute(xdg)) configs.push(xdg);
  add(env.CORVIDINHO_ENV_FILE?.trim(), false, "Corvidinho's secrets env file");
  add(resolveAllowlistPath(env, home) ?? undefined, false, "Corvidinho's allowlist file");
  for (const c of configs) {
    add(join(c, "corvidinho"), true, "Corvidinho's config dir (secrets env, allowlist)");
    add(join(c, "gh"), true, "the gh credential store");
    add(join(c, "git"), true, "the owner's git config (credential helpers)");
  }
  add(env.GH_CONFIG_DIR?.trim(), true, "the gh credential store");
  add(join(home, ".git-credentials"), false, "the git credential store");
  add(join(home, ".gitconfig"), false, "the owner's git config (credential helpers)");
  add(join(home, ".netrc"), false, "the netrc credential store");
  add(join(home, "_netrc"), false, "the netrc credential store");
  add(join(home, ".ssh"), true, "the owner's ssh keys");
  return out;
}

/** `/proc/<pid>/environ`: another process's env (the bot's holds its keys). */
const PROC_ENVIRON = /^\/proc\/[^/]+\/(task\/[^/]+\/)?environ$/;

/** Commands that read whole directory trees. */
const TREE_READERS = new Set([
  "tar", "zip", "7z", "rsync", "find", "rg", "ag", "ack", "fd", "fdfind",
]);

/** True when the command at `words` reads directory trees (`grep -r`, `cp -a` …). */
function readsTrees(words: readonly Word[]): boolean {
  const name = baseName(words[0]!.value);
  if (TREE_READERS.has(name)) return true;
  const flags = words.slice(1).map((w) => w.value);
  if (["grep", "egrep", "fgrep", "zgrep"].includes(name)) {
    return flags.some(
      (v) =>
        /^-[A-Za-z]*[rR]/.test(v) ||
        v === "--recursive" ||
        v === "--dereference-recursive" ||
        v === "--directories=recurse",
    );
  }
  if (name === "cp" || name === "scp") {
    return flags.some((v) => /^-[A-Za-z]*[rRa]/.test(v) || v === "--recursive" || v === "--archive");
  }
  return false;
}

/** Env vars a command may name to put the owner's credentials back (SAFE-21.a). */
function steersCredentials(name: string): boolean {
  return isCredentialEnvKey(name);
}

/** Commands that run another command with an environment of their own (not the scrubbed one). */
const ENV_RESETTERS = new Set(["sudo", "doas", "su", "runuser", "pkexec"]);

/**
 * The wrapper at the head of `words` that drops the child env this shell
 * starts with (SAFE-21.a) — `env -i` / `-` / `--ignore-environment`, bash
 * `exec -c`, or a user switcher that builds its own env — else null.
 */
function resetsEnv(name: string, words: readonly Word[]): string | null {
  if (ENV_RESETTERS.has(name)) return name;
  const opts: string[] = [];
  for (let m = 1; m < words.length; m++) {
    const v = words[m]!.value;
    if (name === "env" && v === "-") return "env -";
    if (v === "--" || !v.startsWith("-")) break;
    opts.push(v);
    // `env -u NAME`, `-C DIR`, `-S STR`, `--unset NAME`: skip the argument.
    if (name === "env" && (/^-[A-Za-z]*[uCS]$/.test(v) || /^--(unset|chdir|split-string)$/.test(v))) {
      m++;
    }
  }
  if (name === "env") {
    const hit = opts.find(
      (v) =>
        (v.length > 3 && "--ignore-environment".startsWith(v)) ||
        (/^-[A-Za-z]+$/.test(v) && v.slice(1).split(/[uCS]/)[0]!.includes("i")),
    );
    return hit ? `env ${hit}` : null;
  }
  if (name === "exec") {
    const hit = opts.find((v) => /^-[A-Za-z]*c/.test(v));
    return hit ? `exec ${hit}` : null;
  }
  return null;
}

/** git `-c` keys that bring credentials back (helpers, includes, URL rewrites, ssh). */
const GIT_CREDENTIAL_KEYS =
  /^(credential\b|include\.|includeif\.|url\.|core\.sshcommand|core\.askpass|http\..*extraheader)/i;

/** The ssh-family commands: each uses the owner's ssh keys. */
const SSH_COMMANDS = new Set([
  "ssh", "scp", "sftp", "ssh-add", "ssh-agent", "ssh-copy-id", "sshfs", "autossh", "mosh",
]);

type SecretCtx = {
  env: NodeJS.ProcessEnv;
  home: string;
  places: SecretPlace[];
};

/** `$NAME` / `${NAME}` expanded from `env` where set (for matching only). */
function expandKnown(v: string, s: SecretCtx): string {
  let out = v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, a, b) => {
    const name = (a ?? b) as string;
    if (name === "HOME") return s.home;
    const val = s.env[name];
    return val != null && val !== "" ? val : m;
  });
  if (out === "~") out = s.home;
  else if (out.startsWith("~/")) out = join(s.home, out.slice(2));
  return out;
}

/**
 * How `path` (absolute) reaches a secret place: `is` it (or is inside it),
 * or — read as a tree (`grep -r`, a glob) — `holds` it. Null when neither.
 */
function placeOf(path: string, s: SecretCtx, tree: boolean): string | null {
  if (PROC_ENVIRON.test(path)) return "is a process's environment (the bot's holds its keys)";
  for (const p of s.places) {
    if (path === p.path) return `is ${p.what}`;
    if (p.dir && path.startsWith(`${p.path}/`)) return `is in ${p.what}`;
    if (tree && (p.path.startsWith(`${path}/`) || path === "/")) {
      return `holds ${p.what}, which this command reads as a tree`;
    }
  }
  return null;
}

/** Most paths one glob is expanded to when it is checked for secrets. */
const MAX_GLOB_MATCHES = 2000;

/** A shell glob component as a regex (a leading `.` must be matched literally). */
function globRegex(component: string): RegExp | null {
  let re = "^";
  for (let k = 0; k < component.length; k++) {
    const c = component[k]!;
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[") {
      const close = component.indexOf("]", k + 2);
      if (close < 0) {
        re += "\\[";
        continue;
      }
      let set = component.slice(k + 1, close);
      if (set.startsWith("!")) set = `^${set.slice(1)}`;
      re += `[${set.replace(/\\/g, "\\\\")}]`;
      k = close;
    } else re += c.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  try {
    return new RegExp(`${re}$`);
  } catch {
    return null;
  }
}

/**
 * The paths `pattern` matches from `base` right now, the way the shell
 * expands it (no leading-dot match without a literal `.`), at most
 * MAX_GLOB_MATCHES of them.
 */
function globMatches(pattern: string, base: string): string[] {
  const abs = isAbsolute(pattern);
  let paths = [abs ? "/" : base];
  for (const part of pattern.split("/")) {
    if (part === "" || part === ".") continue;
    const next: string[] = [];
    if (!/[*?[]/.test(part)) {
      for (const p of paths) next.push(join(p, part));
    } else {
      const rx = globRegex(part);
      if (!rx) return [];
      for (const p of paths) {
        let entries: string[] = [];
        try {
          entries = readdirSync(p);
        } catch {
          continue;
        }
        for (const e of entries) {
          if (e.startsWith(".") && !part.startsWith(".")) continue;
          if (rx.test(e)) next.push(join(p, e));
          if (next.length >= MAX_GLOB_MATCHES) break;
        }
      }
    }
    paths = next;
    if (paths.length === 0 || paths.length >= MAX_GLOB_MATCHES) break;
  }
  return paths;
}

/** Why the path-like word `raw` reads a secret, else null. */
function secretWordWhy(raw: string, cmd: SimpleCommand, s: SecretCtx, tree: boolean): string | null {
  const v = expandKnown(raw, s);
  const pieces = new Set([v]);
  // `HEAD:.env`, `--env-file=.env`, `of=~/.netrc`: the path after `:` / `=`.
  for (const sepChar of [":", "="]) {
    const at = v.indexOf(sepChar);
    if (at >= 0) pieces.add(v.slice(at + 1));
    const last = v.lastIndexOf(sepChar);
    if (last >= 0) pieces.add(v.slice(last + 1));
  }
  for (const p of pieces) {
    if (p === "") continue;
    if (isSecretPath(p)) return `${show(raw)} is a secret path (.env, keys, credentials)`;
    if (PROC_ENVIRON.test(p)) return `${show(raw)} is a process's environment (the bot's holds its keys)`;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) continue; // a URL, not a path
    // A glob reads what it matches now: `cat .en*` is `cat .env`.
    const glob = p.search(/[*?[]/);
    if (glob >= 0) {
      for (const base of cmd.cwds) {
        for (const match of globMatches(p, base)) {
          if (isSecretPath(isAbsolute(p) ? match : relative(base, match))) {
            return `${show(raw)} matches a secret path (.env, keys, credentials)`;
          }
        }
      }
    }
    // A glob also reads what its literal prefix dir holds.
    const literal = glob >= 0 ? p.slice(0, p.lastIndexOf("/", glob) + 1) || "." : p;
    const paths = new Set<string>();
    for (const base of cmd.cwds) {
      paths.add(isAbsolute(literal) ? normalize(literal) : resolve(base, literal));
      const real = physicalPath(base, literal);
      if (real) paths.add(real);
    }
    for (const path of paths) {
      const what = placeOf(path, s, tree || glob >= 0);
      if (what) return `${show(raw)} ${what}`;
    }
  }
  return null;
}

function secretFootgun(cmd: SimpleCommand, s: SecretCtx): Footgun | null {
  const hit = (why: string): Footgun => ({
    rule: "secret",
    why,
    instead: INSTEAD.secret,
    script: cmd.script,
  });
  // Credential env vars, read (`$GH_TOKEN`) or re-pointed (`GIT_SSH_COMMAND=…`,
  // `unset GIT_CONFIG_GLOBAL`, `env -u GH_CONFIG_DIR`).
  for (const w of cmd.words) {
    for (const m of w.value.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const name = m[1]!;
      if (isVerifyEnvDropped(name) || steersCredentials(name)) {
        return hit(`${show(`$${name}`)} is a credential env var`);
      }
    }
    const name = w.value.replace(/^(--unset=|-u)/, "").split(/[+]?=/)[0]!;
    if (steersCredentials(name)) {
      return hit(
        `${show(w.value)} would point git or gh back at the owner's credentials (SAFE-21.a)`,
      );
    }
  }
  const chain = cmd.start < cmd.words.length ? commandChain(cmd.words, cmd.start) : [];
  let tree = false;
  for (let n = 0; n < chain.length; n++) {
    const words = linkWords(cmd, chain, n);
    const name = baseName(words[0]!.value);
    const args = words.slice(1).map((w) => w.value);
    if (readsTrees(words)) tree = true;
    if (SSH_COMMANDS.has(name)) return hit(`${show(name)} uses the owner's ssh keys (~/.ssh)`);
    const reset = resetsEnv(name, words);
    if (reset) {
      return hit(
        `${show(reset)} starts its command with a fresh environment, which points git and gh ` +
          "back at the owner's credentials (SAFE-21.a)",
      );
    }
    if (name === "ps" && args.some((v) => !v.startsWith("-") && /^[A-Za-z]*e[A-Za-z]*$/.test(v))) {
      return hit("`ps e` shows other processes' environments (the bot's holds its keys)");
    }
    if (name === "rsync" && (args.some((v) => /^-[A-Za-z]*e|^--rsh/.test(v)) ||
      args.some((v) => /^[^/:]+:(?!\/\/)/.test(v)))) {
      return hit("`rsync` to a remote host uses the owner's ssh keys (~/.ssh)");
    }
    if (name === "gh") {
      const at = args.indexOf("auth");
      const action = at >= 0 ? args[at + 1] : undefined;
      if (action === "token" || action === "git-credential") {
        return hit(`${show(`gh auth ${action}`)} prints a GitHub credential`);
      }
      if (action === "status" && args.some((v) => v === "-t" || v === "--show-token")) {
        return hit("`gh auth status --show-token` prints a GitHub credential");
      }
      if (action && ["login", "refresh", "setup-git", "switch"].includes(action)) {
        return hit(
          `${show(`gh auth ${action}`)} would give the shell the owner's GitHub credentials (SAFE-21.a)`,
        );
      }
    }
    if (name === "git") {
      const g = gitParts(words);
      for (const c of g.configs) {
        if (c.value.startsWith("--config-env") || GIT_CREDENTIAL_KEYS.test(c.value)) {
          return hit(
            `${show(`git -c ${c.value}`)} would point git back at credentials (SAFE-21.a)`,
          );
        }
      }
      const sub = args[g.sub - 1] ?? "";
      if (sub === "credential" || sub.startsWith("credential-")) {
        return hit(`${show(`git ${sub}`)} reads or stores git credentials`);
      }
      if (sub === "config" && args.slice(g.sub).some((v) => GIT_CREDENTIAL_KEYS.test(v))) {
        return hit("`git config` of a credential, include or URL key would point git back at credentials (SAFE-21.a)");
      }
    }
  }
  const targets: string[] = [];
  for (const w of cmd.words) targets.push(w.value);
  for (const r of cmd.redirs) {
    if (r.target && r.kind !== "heredoc") targets.push(r.target.value);
  }
  for (const v of targets) {
    const why = secretWordWhy(v, cmd, s, tree);
    if (why) return hit(why);
  }
  return null;
}

// ------------------------------------------------------------------ entry

/**
 * The first SAFE-21 foot-gun in `cmd` run from `root`, else null. Every
 * simple command is read (see {@link forEachSimpleCommand}); what the SAFE-3
 * clamp cannot read is left to it.
 */
export function firstFootgun(
  cmd: string,
  root: string,
  opts: FootgunOptions = {},
): Footgun | null {
  const env = opts.env ?? process.env;
  const home = opts.home ?? env.HOME ?? homedir();
  const rootAbs = resolve(root);
  const all: SimpleCommand[] = [];
  forEachSimpleCommand(cmd, rootAbs, (c) => {
    all.push(c);
    return null;
  });
  const anyDownload = all.some(isDownloader);
  const s: SecretCtx = { env, home, places: secretPlaces(env, home) };
  // The most serious family first, so `curl … > x.sh; sh x.sh` names the download.
  const rules: ((c: SimpleCommand) => Footgun | null)[] = [
    (c) => downloadFootgun(c, all, anyDownload),
    (c) => deleteFootgun(c, rootAbs),
    (c) => secretFootgun(c, s),
    editFootgun,
  ];
  for (const rule of rules) {
    for (const c of all) {
      const f = rule(c);
      if (f) return f;
    }
  }
  return null;
}
