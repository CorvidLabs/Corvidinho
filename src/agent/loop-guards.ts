/**
 * AGENT-16 (#86): "When it repeats a failing call, it changes approach or
 * asks me." Pure helpers for the task-run tool loop (src/agent/execute.ts);
 * no I/O besides reading the in-memory plugin registry.
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

/** True when this tool result changed something (see module doc). */
export function changedState(
  name: string,
  result: Pick<PluginHandlerResult, "ok" | "data">,
): boolean {
  if (filesChangedFromToolData(result.data).length > 0) return true;
  if (!result.ok) return false;
  if (STATE_CHANGING_TOOLS.has(name)) return true;
  return Boolean(get(name)?.origin?.startsWith("fledge:"));
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
