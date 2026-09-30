/**
 * AGENT-16 (#86): "When it repeats a failing call, it changes approach or
 * asks me." AGENT-17 (#86, nudge half): a reply that only plans, or says
 * "Done." without changing anything, gets one nudge. Pure helpers for the
 * task-run tool loop (src/agent/execute.ts); no I/O besides reading the
 * in-memory plugin registry (and the caller's diff probe, {@link nothingChanged}).
 *
 * - {@link callSignature}: the tool name plus its canonical argv, so
 *   `{"argv":["a"]}` and `["a"]` are the same call.
 * - {@link changedState}: the one "something changed" predicate. True when a
 *   result reports `filesChanged` (ok or not: a failed delegate worker may
 *   still have edited files) or when a real write tool succeeds. Not plain
 *   `isMutatingPlugin`, which also flags `web-fetch`, `danger-ping`,
 *   `fledge-lanes-run` and `council`: none of those changes what a failing
 *   call depends on.
 * - {@link createRepeatFailureGuard}: counts `ok: false` results per call
 *   signature (refusals and denials included) and resets every count on a
 *   real change. The 2nd identical failure gets {@link repeatFailureSteer}
 *   after its tool result; an identical call made after the model has seen
 *   that steer (in this conversation) does not run, and the attempt ends with
 *   {@link repeatedFailureAsk} (the existing "stuck" HumanAsk, which pings the
 *   owner, AUTONOMY-2/4). A steer the model has not seen yet (same tool_calls
 *   batch, or a fresh verify-retry conversation) means "steer again", never
 *   "ask", so changing approach is always offered before asking.
 * - {@link stallKind}: a narrow English heuristic for a final reply that is
 *   only a plan (`plan`) or a short "Done."-style or empty claim
 *   (`done-claim`); never a question, an offer, "let me know", a decline,
 *   code or a toy demo, a social reply or an answer, and never a plan the
 *   task asked for ({@link planWanted}).
 * - {@link changedForStall}: {@link changedState}, or a successful memory
 *   write ({@link STALL_CHANGE_TOOLS}), which AGENT-16 leaves out.
 * - {@link nothingChanged}: no result of the run changed anything
 *   ({@link changedForStall}), no tool ran whose edits no result reports,
 *   and the verify gate's real git diff (where there is a git tree) is empty.
 * - {@link createStallNudgeGuard}: remembers a change in any attempt of the
 *   run; the first stall of a run gets {@link stallNudge} (to the same
 *   model); later ones stand with an operator note. Moving to a stronger
 *   model is not built yet.
 *
 * Thresholds are constants; there is no knob (no env var, config key or flag).
 */

import { get } from "../plugins/registry.ts";
import type { PluginHandlerResult } from "../plugins/types.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { argvFromToolArguments, filesChangedFromToolData } from "./tools.ts";
import type { HumanAsk } from "./types.ts";

/** Identical failures (nothing changed in between) before the steer. */
export const STEER_AFTER_FAILURES = 2;

/** Longest error excerpt quoted in the steer (chars, after scrubbing). */
export const STEER_ERROR_EXCERPT_MAX = 200;

/**
 * Builtins whose success changes state a failing call may depend on: files,
 * git, GitHub, Discord, memory ACL, a SpecSync change (AGENT-18), a delegate
 * worker, and the shell, the language runners and Fledge core runs (they run
 * arbitrary commands; offered only once SAFE-3.a allows them). Fledge plugin
 * commands (`origin` `fledge:`) count too ({@link changedState}).
 */
export const STATE_CHANGING_TOOLS: ReadonlySet<string> = new Set([
  "files-write",
  "files-edit",
  "files-delete",
  "git-branch-create",
  "git-commit",
  "git-push",
  "github-issue-create",
  "github-issue-comment",
  "github-pr-create",
  "github-pr-review",
  "discord-post-message",
  "discord-send-file",
  "memory-forget",
  "memory-override",
  "delegate",
  "shell-exec",
  "node-exec",
  "python-exec",
  "cargo-exec",
  "fledge-run",
  // AGENT-18 / AGENT-18.a: a SpecSync change opened, answered, approved or archived.
  "specsync-change-new",
  "specsync-change-answer",
  "specsync-change-approve",
  "specsync-change-finalize",
]);

/**
 * Dangerous or mutating builtins whose success is not a change: a page read
 * (`web-fetch`), a no-op probe (`danger-ping`), a check lane
 * (`fledge-lanes-run`) and advice (`council`). Every dangerous or mutating
 * builtin is in exactly one of the two sets (tests/agent.loop-guards.test.ts).
 */
export const NO_STATE_CHANGE_TOOLS: ReadonlySet<string> = new Set([
  "web-fetch",
  "danger-ping",
  "fledge-lanes-run",
  "council",
]);

/** One call's identity: tool name + canonical argv (JSON). */
export function callSignature(name: string, rawArgs: string | undefined): string {
  return JSON.stringify([name, argvFromToolArguments(rawArgs)]);
}

/**
 * True for a tool whose success changes state: a {@link STATE_CHANGING_TOOLS}
 * builtin or a Fledge plugin command (`origin` `fledge:`). {@link changedState}
 * uses it for results; AGENT-17 uses it for the round's catalog.
 */
export function isStateChangingTool(name: string): boolean {
  if (STATE_CHANGING_TOOLS.has(name)) return true;
  return Boolean(get(name)?.origin?.startsWith("fledge:"));
}

/** True when this tool result changed something (see module doc). */
export function changedState(
  name: string,
  result: Pick<PluginHandlerResult, "ok" | "data">,
): boolean {
  if (filesChangedFromToolData(result.data).length > 0) return true;
  if (!result.ok) return false;
  return isStateChangingTool(name);
}

/** Scrubbed, one-line, capped error text for the steer / operator note. */
export function errorExcerpt(error: string | undefined): string {
  const line = scrubSecrets(error ?? "tool failed").replace(/\s+/g, " ").trim() || "tool failed";
  return line.length <= STEER_ERROR_EXCERPT_MAX
    ? line
    : `${line.slice(0, STEER_ERROR_EXCERPT_MAX - 1)}…`;
}

/** Steer wording when the error sits inside a SAFE-12 fence (never quoted outside it). */
export const STEER_FENCED_ERROR_NOTE = "its error is in the untrusted result above";

/**
 * Harness text after the tool result of the 2nd (or later) identical
 * failure. It follows the tool content (and any SAFE-12 fence) whole, so
 * the model reads it as the harness speaking, not as data; the error is
 * quoted as a JSON string. `error` null: the result was fenced as untrusted
 * data (a `delegate` / `council` worker that reported an injection), so no
 * piece of it is quoted outside the fence (SAFE-12).
 */
export function repeatFailureSteer(
  label: string,
  failures: number,
  error: string | undefined | null,
): string {
  const last =
    error === null ? STEER_FENCED_ERROR_NOTE : `last error: ${JSON.stringify(errorExcerpt(error))}`;
  return (
    `[Corvidinho harness — AGENT-16] This exact ${label} call has now failed ${failures} times ` +
    `with nothing changed in between (${last}). ` +
    "Don't repeat it: change approach (a different tool or different arguments) or call ask-human. " +
    "Making the same call again stops the run and asks the owner."
  );
}

/** ToolResult detail for the identical call that was not run. */
export const REPEAT_FAILURE_BLOCK_DETAIL =
  "not run: this exact call kept failing with nothing changed, even after the steer; stopped to ask (AGENT-16)";

/**
 * The "stuck" ask a repeated failure ends with. `label` is an offered tool
 * name or UNKNOWN_TOOL_LABEL: never error text or a refused plugin's name
 * (ROLES-CHAT-3, SAFE-13).
 */
export function repeatedFailureAsk(label: string): HumanAsk {
  return {
    reason: "stuck",
    question: `The same ${label} call keeps failing with nothing changed in between. How should I proceed?`,
  };
}

export type RepeatFailureGuard = {
  /**
   * A new conversation starts (each execute attempt): no steer has reached
   * the model in it yet. Failure counts carry over (one run).
   */
  newConversation(): void;
  /**
   * Before running a call in `round` of the current conversation: "ask" when
   * it already failed {@link STEER_AFTER_FAILURES}+ times with nothing
   * changed and its steer went out in an earlier round of this
   * conversation; else "run".
   */
  before(sig: string, round: number): "run" | "ask";
  /**
   * After a call ran. A change resets every count; a success resets its own
   * count; a failure counts. Returns the failures now recorded for `sig` and
   * whether the steer goes after this result (recorded as sent in `round`).
   */
  after(
    sig: string,
    round: number,
    result: { ok: boolean; error?: string },
    changed: boolean,
  ): { failures: number; steer: boolean };
  /** Last error of `sig` since the last change (for the operator note). */
  lastError(sig: string): string | undefined;
};

export function createRepeatFailureGuard(): RepeatFailureGuard {
  const failures = new Map<string, number>();
  const errors = new Map<string, string>();
  // Round in which each signature's steer was first added, this conversation.
  let steered = new Map<string, number>();
  return {
    newConversation() {
      steered = new Map();
    },
    before(sig, round) {
      const n = failures.get(sig) ?? 0;
      const at = steered.get(sig);
      return n >= STEER_AFTER_FAILURES && at !== undefined && at < round ? "ask" : "run";
    },
    after(sig, round, result, changed) {
      if (changed) {
        failures.clear();
        errors.clear();
        steered.clear();
        return { failures: 0, steer: false };
      }
      if (result.ok) {
        failures.delete(sig);
        errors.delete(sig);
        steered.delete(sig);
        return { failures: 0, steer: false };
      }
      const n = (failures.get(sig) ?? 0) + 1;
      failures.set(sig, n);
      errors.set(sig, result.error ?? "tool failed");
      const steer = n >= STEER_AFTER_FAILURES;
      if (steer && !steered.has(sig)) steered.set(sig, round);
      return { failures: n, steer };
    },
    lastError: (sig) => errors.get(sig),
  };
}

// ---------------------------------------------------------------------------
// AGENT-17 (#86), the nudge half: "If it only plans, or says 'Done.' without
// changing anything, it gets one nudge, then moves to a stronger model I've
// configured." Moving to a stronger model is not built yet: a second stall
// stands, with an operator note.

/** A final reply that stalls: only a plan, or a short "Done."-style or empty claim. */
export type StallKind = "plan" | "done-claim";

/** Longest reply (trimmed characters) that can be a "Done."-style claim. */
export const STALL_DONE_MAX_CHARS = 60;

/** Longest reply (trimmed characters) that can be only a plan. */
export const STALL_PLAN_MAX_CHARS = 600;

/** The nudge's first words (harness text, not the owner speaking). */
export const STALL_NUDGE_MARK = "[Corvidinho harness — AGENT-17]";

/**
 * Builtins whose success is a change for AGENT-17 although AGENT-16's
 * {@link changedState} leaves them out: a memory stored or a forget-me asked
 * for ("remember that …" → memory-store → "Done." is not a stall). Only the
 * "nothing changed" check reads it; the catalog check does not.
 */
export const STALL_CHANGE_TOOLS: ReadonlySet<string> = new Set(["memory-store", "memory-forget-me"]);

/** AGENT-17: this tool result changed something ({@link changedState}, or a successful memory write). */
export function changedForStall(
  name: string,
  result: Pick<PluginHandlerResult, "ok" | "data">,
): boolean {
  return changedState(name, result) || (Boolean(result.ok) && STALL_CHANGE_TOOLS.has(name));
}

/**
 * Never a stall, whatever else the reply says: a question (a clarifying ask,
 * AUTONOMY-1), an offer or "let me know", a decline (AUTONOMY-7), code, a toy
 * demo or joke (AUTONOMY-7), or a deferral ("I'll check back later").
 */
const NOT_A_STALL: readonly RegExp[] = [
  /\?/,
  /```/,
  /\b(?:let me know|would you like|do you want|shall i|should i|feel free)\b/,
  /\bif you(?:'d| would)? (?:like|want|prefer|need)\b/,
  /\b(?:can't|cannot|can not|won't|unable|not able|not allowed|not permitted|not possible|impossible|decline|refuse|sorry|rather not)\b/,
  /\b(?:toy|demo|joke|kidding)\b/,
  /\b(?:later|tomorrow|soon|in a bit|when you're ready|next time|in the future|from now on|going forward)\b/,
];

/**
 * The task asks for a plan, or asks for nothing to change yet: a plan-only
 * reply is then the answer (Q&A), never a stall. Read over the whole task
 * text, so a match anywhere means no plan nudge (no nudge when unsure).
 */
const PLAN_WANTED: readonly RegExp[] = [
  /\b(?:plan|plans|planning|approach|outline|propose|proposal|strategy)\b/,
  /\bhow (?:would|should|could|might|will) (?:you|we|i)\b/,
  /\bwhat (?:would|should|could|will) (?:you|we|i) (?:do|change)\b/,
  /\bwhat you(?:'d| would)\b/,
  /\b(?:don't|dont|do not|without)\s+(?:\w+\s+){0,2}(?:chang|edit|touch|modif|commit|implement|writ)\w*/,
];

/** AGENT-17: the task asks for a plan, or for nothing to change yet ({@link PLAN_WANTED}). */
export function planWanted(task: string): boolean {
  const t = stallText(task);
  return PLAN_WANTED.some((re) => re.test(t));
}

/** Whole-reply "Done."-style claims (lower case, ends trimmed of punctuation and emoji). */
const DONE_CLAIMS: readonly RegExp[] = [
  // "Done.", "All done!", "Task complete.", "Okay, that's fixed now."
  /^(?:(?:ok|okay|alright|all right|sure|great)[,.!]*\s+)?(?:(?:it's|it is|that's|that is|this is|everything's|everything is|all|the task is|task is|task)\s+)?(?:done|finished|complete|completed|fixed|implemented|all set|taken care of)(?:\s+(?:now|already|as requested))?$/,
  // "I've done it.", "I have finished the task."
  /^i(?:'ve| have)?\s+(?:done|finished|completed|fixed|implemented|made|applied|handled)\s+(?:it|that|this|them|the (?:task|change|changes|fix|edit|edits|update|updates|work))(?:\s+(?:now|already|as requested))?$/,
  // "Changes made.", "The edits are applied."
  /^(?:the\s+)?(?:task|work|change|changes|fix|edit|edits|update|updates)\s+(?:(?:is|are|has been|have been)\s+)?(?:done|made|applied|complete|completed|finished)(?:\s+(?:now|already|as requested))?$/,
];

/** Verbs a plan step starts with (after its opener). */
const PLAN_VERBS =
  "add|apply|build|change|check|commit|create|delete|edit|fix|implement|inspect|investigate|look|make|modify|move|open|patch|push|read|refactor|remove|rename|replace|rewrite|run|search|start|update|write";

/** "I'll update …", "Let me check …", "Okay, first I'm going to fix …". */
const PLAN_OPENER = new RegExp(
  "^(?:(?:ok|okay|alright|all right|sure|got it|understood|on it)[,.!]*\\s+)?" +
    "(?:(?:first|next|now|so)[,]?\\s+)?" +
    "(?:i'll|i will|i'm going to|i am going to|i'm gonna|i plan to|i intend to|let me)\\s+" +
    "(?:(?:now|first|then|next|also|quickly|go ahead and)\\s+)*" +
    `(?:${PLAN_VERBS})\\b`,
);

/** "Plan:", "My plan:", "Here's my plan:", "Here's what I'll do:". */
const PLAN_HEADING =
  /^(?:(?:here's|here is)\s+)?(?:my\s+)?plan:?$|^here(?:'s| is) what i(?:'ll| will| am going to|'m going to) do:?$/;

/** A later step: "Then I'll run the tests.", "2. Fix the parser", "- read a.ts", "commit it." */
const PLAN_STEP = new RegExp(
  "^(?:(?:\\d+[.)]|[-*•])\\s+)?" +
    "(?:(?:and\\s+)?then|next|after that|afterwards|finally|once that's done)?[,]?\\s*" +
    "(?:(?:i'll|i will|i'm going to|i am going to|let me)\\s+)?" +
    `(?:${PLAN_VERBS})\\b`,
);

/** An interjection sentence around a plan ("Sure!", "On it."). */
const PLAN_FILLER = /^(?:ok|okay|alright|all right|sure|got it|understood|on it|will do|right)[.!,]*$/;

/** Lower case, curly apostrophes straightened. */
function stallText(text: string): string {
  return text.toLowerCase().replace(/[‘’ʼ]/g, "'");
}

/** The sentences of a plan-shaped reply: split at line breaks and sentence ends. */
function planUnits(text: string): string[] {
  return text
    .split(/\n+/)
    // Not after a list number ("1. Read …").
    .flatMap((line) => line.split(/(?<=\D[.!…:;])\s+|\s+[—–]\s+/))
    .map((u) => u.replace(/^[\s>#*_]+|[\s*_]+$/g, ""))
    .filter((u) => u.length > 0);
}

/**
 * AGENT-17: what a final reply (no tool calls) stalls as, or null. `plan`:
 * every sentence is a step of a plan that opens with "I'll …", "Let me …",
 * "I'm going to …" (or a "My plan:" heading) and a work verb, at most
 * {@link STALL_PLAN_MAX_CHARS}, unless `task` asks for a plan or for nothing
 * to change yet ({@link planWanted}). `done-claim`: an empty reply, or the
 * whole reply is a short "Done."-style claim (at most
 * {@link STALL_DONE_MAX_CHARS}). Deliberately narrow: a question
 * (AUTONOMY-1), an offer or "let me know", a decline or a toy demo
 * (AUTONOMY-7), code, a deferral ("later", "next time"), a social reply
 * ("Thanks!", "I'll be around"), "Yes, it's done." and any sentence that
 * answers rather than plans ("Let me check… yes: …") are null.
 */
export function stallKind(text: string, task = ""): StallKind | null {
  const trimmed = text.trim();
  if (trimmed === "") return "done-claim";
  const t = stallText(trimmed);
  if (NOT_A_STALL.some((re) => re.test(t))) return null;

  if (t.length <= STALL_DONE_MAX_CHARS) {
    const claim = t
      .replace(/^[\s\p{P}\p{S}\p{M}‍]+|[\s\p{P}\p{S}\p{M}‍]+$/gu, "")
      .replace(/\s+/g, " ");
    if (claim && DONE_CLAIMS.some((re) => re.test(claim))) return "done-claim";
  }

  if (t.length > STALL_PLAN_MAX_CHARS) return null;
  let opened = false;
  for (const unit of planUnits(t)) {
    if (PLAN_FILLER.test(unit)) continue;
    if (!opened) {
      if (!PLAN_OPENER.test(unit) && !PLAN_HEADING.test(unit)) return null;
      opened = true;
      continue;
    }
    if (!PLAN_OPENER.test(unit) && !PLAN_STEP.test(unit)) return null;
  }
  return opened && !planWanted(task) ? "plan" : null;
}

/**
 * AGENT-17: true when nothing changed in the run so far — no result changed
 * anything ({@link changedForStall}, via the stall guard's `sawChange`, every
 * attempt), no tool ran whose edits no result reports, and, where there is a
 * git tree, the verify gate's real diff since the run's baseline
 * (`workspaceChanged`, `WorkspaceDiffTracker.changed`) is empty. A diff git
 * cannot read counts as a change (no nudge when unsure).
 */
export async function nothingChanged(opts: {
  sawChange: boolean;
  unreportedEdits: boolean;
  workspaceChanged?: () => Promise<string[] | null>;
}): Promise<boolean> {
  if (opts.sawChange || opts.unreportedEdits) return false;
  if (!opts.workspaceChanged) return true;
  try {
    const real = await opts.workspaceChanged();
    return real !== null && real.length === 0;
  } catch {
    return false;
  }
}

/**
 * The harness text a stalled reply gets once (a user message to the same
 * model). `askOffered`: `ask-human` is in the catalog.
 */
export function stallNudge(kind: StallKind, askOffered: boolean): string {
  const said =
    kind === "plan"
      ? "Your reply only described a plan, and nothing has changed in this run yet."
      : "Your reply said the work is done (or said nothing), but nothing has changed in this run: no file edits and no other changes.";
  return (
    `${STALL_NUDGE_MARK} ${said} ` +
    "If the task needs changes, make them now with the tools you have. " +
    "If it needs none, reply with what you checked and found instead." +
    (kind === "plan"
      ? " If you were asked only for a plan, or not to change anything yet, change nothing: reply with the plan as your answer."
      : "") +
    (askOffered ? " If you can't go on without the owner's choice, call ask-human." : "")
  );
}

/** Operator Text line when the nudge goes out. */
export function stallNudgedNote(kind: StallKind): string {
  return `[operator] AGENT-17: the reply was ${stallLabel(kind)} with nothing changed; nudged once (same model)`;
}

/** Operator Text line when a stall after the nudge stands. */
export function stallStandsNote(kind: StallKind): string {
  return `[operator] AGENT-17: the reply was ${stallLabel(kind)} with nothing changed, after the nudge; the reply stands (moving to a stronger model is not built yet)`;
}

function stallLabel(kind: StallKind): string {
  return kind === "plan" ? "only a plan" : "a 'Done.'-style or empty claim";
}

export type StallNudgeGuard = {
  /**
   * A tool result of the run changed something ({@link changedForStall}), or
   * a tool ran whose edits no result reports; remembered for every attempt.
   */
  changed(): void;
  /** True once {@link StallNudgeGuard.changed} was called in this run. */
  sawChange(): boolean;
  /** A stall in this run: "nudge" the first time, "stand" after that. */
  next(): "nudge" | "stand";
};

/** One per `createTaskExecute` (one run, every attempt): one nudge per run. */
export function createStallNudgeGuard(): StallNudgeGuard {
  let nudged = false;
  let changedOnce = false;
  return {
    changed() {
      changedOnce = true;
    },
    sawChange: () => changedOnce,
    next() {
      if (nudged) return "stand";
      nudged = true;
      return "nudge";
    },
  };
}
