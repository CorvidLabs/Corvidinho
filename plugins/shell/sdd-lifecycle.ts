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
 * Its `change` subcommand's step is read past SpecSync's options, failing
 * closed: a word right after an option may be the option's value or the step,
 * so a lifecycle step there counts; a step that expands, or one `xargs`
 * supplies from its input, refuses.
 *
 * Residual (stated in the spec): code an interpreter runs (`bun -e`,
 * `node -e`, `python -c`, a script handed to `node` / `python`, the
 * `node-exec` / `python-exec` / `cargo-exec` runners) that spawns specsync
 * itself is not parsed; neither are package-manager scripts, make / just
 * recipes and git aliases, or a copy of the binary under another name.
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

/**
 * `specsync`, `/usr/bin/specsync`, `./bin/specsync`, `specsync@6.0.0`,
 * `@scope/specsync@1`, and an option's value (`--bin=specsync`).
 */
function namesSpecsync(w: Word): boolean {
  if (w.expands) return false;
  const v = w.value.startsWith("-") ? w.value.slice(w.value.indexOf("=") + 1) : w.value;
  let base = baseName(v);
  const at = base.indexOf("@", 1);
  if (at > 0) base = base.slice(0, at);
  return base === "specsync";
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
    if (!w.expands && STEPS.has(w.value)) return { step: w.value, unread: null };
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
 * null: every literal `change` the subcommand scan reaches (past options and
 * what may be their values) is read.
 */
function invocationStep(
  words: readonly Word[],
  k: number,
  fed: boolean,
  literalOnly: boolean,
): Verdict | null {
  let afterOpt = false;
  for (let m = k + 1; m < words.length; m++) {
    const w = words[m]!;
    if (isOption(w)) {
      afterOpt = w.value !== "--" && !w.value.includes("=");
      continue;
    }
    if (!w.expands && w.value === "change") {
      const v = stepAfterChange(words, m, fed, literalOnly);
      if (v) return v;
    }
    if (afterOpt) {
      afterOpt = false;
      continue;
    }
    return null; // the subcommand: `change` (read above) or another one
  }
  return null;
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
  const links = new Set(commandChain(words, cmd.start).map((l) => l.k));
  let fed = false; // an `xargs` in front: it appends words from its input
  for (let k = cmd.start; k < words.length; k++) {
    const w = words[k]!;
    if (!w.expands && baseName(w.value) === "xargs") fed = true;
    const named = namesSpecsync(w) || (links.has(k) && linksToSpecsync(w, cmd, root));
    // An expanding command word may be specsync: only a literal step refuses.
    const unknown = !named && links.has(k) && w.expands;
    if (!named && !unknown) continue;
    const v = invocationStep(words, k, fed, unknown);
    if (v) return { ...v, text: show(words, k), script: cmd.script };
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
