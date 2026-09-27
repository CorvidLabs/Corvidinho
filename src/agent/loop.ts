/**
 * Prove-before-done task loop (Merlin agent-loop Verifying steal).
 * Planning: SpecSync list/read via spec_loader (SPECSYNC-1/5).
 * Verifying: fledge lanes run verify (includes spec-check when wired).
 * The gate sees tool-reported files plus the real git working-tree diff
 * (REQ-agent-085).
 */

import { relative, resolve } from "node:path";
import {
  blockedTaskResult,
  formatAskSummary,
  stuckAfterVerifyAsk,
} from "./ask.ts";
import { loadAgentConfig } from "./config.ts";
import { loadRelevantSpecs } from "./specLoader.ts";
import {
  defaultVerifyRunner,
  VERIFY_FEEDBACK_MAX_CHARS,
  verifyFeedbackExcerpt,
} from "./verify.ts";
import { startWorkspaceDiff, WORKSPACE_DIFF_MAX_FILES } from "./workspace-diff.ts";
import type {
  AgentEvent,
  AgentState,
  RunTaskOptions,
  TaskResult,
  WorkspaceDiffTracker,
} from "./types.ts";

/** Changed paths named in the gate's Text note before "…". */
const UNREPORTED_PREVIEW = 5;

/** Start of the feedback a retry gets after a failed verify (AGENT-4.a). */
const VERIFY_FEEDBACK_HEAD =
  "Verification failed. Fix these errors and try again:\n\n";

function emit(
  onEvent: ((e: AgentEvent) => void) | undefined,
  event: AgentEvent,
): void {
  onEvent?.(event);
}

function setState(
  onEvent: ((e: AgentEvent) => void) | undefined,
  state: AgentState,
): void {
  emit(onEvent, { type: "StateChanged", state });
}

function isAborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

function cancelledResult(
  summary: string,
  filesChanged: string[],
  attempts: number,
): TaskResult {
  return {
    summary,
    filesChanged,
    verified: false,
    verifySkipped: false,
    cancelled: true,
    state: "failed",
    attempts,
  };
}

/**
 * Run one task through planning → executing → (optional) verifying → done|failed.
 * Does not invent Trust/attest. Injectable execute + verifyRunner for tests.
 */
export async function runTask(opts: RunTaskOptions): Promise<TaskResult> {
  const onEvent = opts.onEvent;
  const signal = opts.signal ?? new AbortController().signal;
  const fileConfig = opts.config ?? loadAgentConfig(opts.cwd);
  const verifyBeforeComplete =
    opts.verifyBeforeComplete ?? fileConfig.verifyBeforeComplete;
  const maxRetries = opts.maxRetries ?? fileConfig.maxRetries;
  const verifyRunner = opts.verifyRunner ?? defaultVerifyRunner;

  let summary = "";
  let filesChanged: string[] = [];
  let attempts = 0;
  let verifyFeedback: string | undefined;
  let specBriefing: string | undefined;
  // Output of the last failed verify, kept for the human-facing summary.
  let lastVerifyFailure: string | undefined;
  let retries = 0;
  // Real-diff paths added to filesChanged so far (capped per run).
  let realDiffAdded = 0;
  // AGENT-4 (REQ-agent-502): tools run so far whose edits no result reports.
  const unreportedEditTools = new Set<string>();

  setState(onEvent, "planning");
  if (isAborted(signal)) {
    return cancelledResult(summary, filesChanged, attempts);
  }

  // Merlin Planning: list → select → read → constraint extract (+ companions)
  const taskText = opts.task?.trim() ?? "";
  if (taskText) {
    try {
      const briefing = loadRelevantSpecs({ cwd: opts.cwd, task: taskText });
      if (briefing) {
        // AGENT-2: the constraints must reach the model, not only the event.
        specBriefing = briefing;
        emit(onEvent, {
          type: "Text",
          text: `Planning: SpecSync briefing\n\n${briefing}`,
        });
      } else {
        emit(onEvent, {
          type: "Text",
          text: "Planning: no SpecSync modules matched task tokens (or registry empty).",
        });
      }
    } catch (err) {
      emit(onEvent, {
        type: "Text",
        text: `Planning: SpecSync briefing skipped (${err instanceof Error ? err.message : String(err)}).`,
      });
    }
  } else {
    emit(onEvent, {
      type: "Text",
      text: "Planning: ready to execute (pass task text for SpecSync briefing).",
    });
  }

  // AGENT-4 (REQ-agent-085): snapshot the git working tree before the first
  // attempt so the gate also sees edits no tool reports. No git work tree
  // (or an unreadable one) ⇒ null: tool-reported files only, as before.
  let workspace: WorkspaceDiffTracker | null = null;
  if (verifyBeforeComplete) {
    try {
      workspace = await (opts.workspaceDiff ?? startWorkspaceDiff)(opts.cwd);
    } catch {
      workspace = null;
    }
  }

  for (;;) {
    if (isAborted(signal)) {
      return cancelledResult(summary, filesChanged, attempts);
    }

    setState(onEvent, "executing");
    attempts += 1;
    const exec = await opts.execute({
      attempt: attempts,
      verifyFeedback,
      signal,
      specBriefing,
    });
    summary = exec.summary;
    // AGENT-4: union across attempts. Files from an attempt whose verify
    // failed stay in the gate, so a retry that changes nothing is verified
    // again and can never be reported done.
    filesChanged = [...new Set([...filesChanged, ...exec.filesChanged])];
    for (const name of exec.unreportedEditTools ?? []) unreportedEditTools.add(name);

    if (isAborted(signal)) {
      return cancelledResult(summary, filesChanged, attempts);
    }

    // AUTONOMY-1: the agent asked the human — blocked, not done, no verify.
    if (exec.ask) {
      setState(onEvent, "blocked");
      return blockedTaskResult({ ...exec, filesChanged, ask: exec.ask }, attempts);
    }

    // AGENT-4/8: a provider / HTTP failure is a failed run, never done.
    if (exec.error) {
      setState(onEvent, "failed");
      // AGENT-4: a verify that already failed is still said plainly, so the
      // provider error does not hide failing files left on disk.
      const verifyNote =
        lastVerifyFailure === undefined
          ? ""
          : `\n\nVerification failed on an earlier attempt and was not re-run:\n${lastVerifyFailure}`;
      return {
        summary: `${summary}${verifyNote}`,
        filesChanged,
        verified: false,
        verifySkipped: false,
        cancelled: false,
        state: "failed",
        attempts,
      };
    }

    // AGENT-4 (REQ-agent-085): add the run's real git diff to the gate, so an
    // edit made outside the file tools (code-tier shell-exec, a delegate
    // worker, a commit through a shell) is verified too. A diff git cannot
    // read after a good snapshot fails closed: verify runs.
    let diffUnreadable = false;
    if (workspace) {
      let real: string[] | null;
      try {
        real = await workspace.changed();
      } catch {
        real = null;
      }
      if (isAborted(signal)) {
        return cancelledResult(summary, filesChanged, attempts);
      }
      if (real === null) {
        diffUnreadable = true;
        emit(onEvent, {
          type: "Text",
          text: "Verify gate: could not read the git working-tree diff, so verifying anyway.",
        });
      } else {
        const root = resolve(opts.cwd);
        const reported = new Set(filesChanged.map((f) => relative(root, resolve(root, f))));
        const unreported = real.filter((p) => !reported.has(p));
        if (unreported.length > 0) {
          const shown = unreported.slice(0, UNREPORTED_PREVIEW).join(", ");
          const more = unreported.length > UNREPORTED_PREVIEW ? ", …" : "";
          // Bounded so a huge diff (an install, a branch switch) cannot push
          // the NDJSON result line past the parser cap and lose the reply.
          // The gate is unaffected: filesChanged is non-empty either way.
          const added = unreported.slice(
            0,
            Math.max(0, WORKSPACE_DIFF_MAX_FILES - realDiffAdded),
          );
          const capped =
            added.length < unreported.length
              ? `; ${added.length} of them listed in filesChanged`
              : "";
          emit(onEvent, {
            type: "Text",
            text: `Verify gate: the git working tree has ${unreported.length} changed path(s) no tool reported (${shown}${more})${capped}.`,
          });
          filesChanged = [...filesChanged, ...added];
          realDiffAdded += added.length;
        }
      }
    }

    // AGENT-4 (REQ-agent-502): no git snapshot to diff, and a tool ran that
    // can change files without reporting them (a Fledge command): fail
    // closed, verify runs.
    let noDiffForUnreported = false;
    if (
      verifyBeforeComplete &&
      !workspace &&
      filesChanged.length === 0 &&
      unreportedEditTools.size > 0
    ) {
      noDiffForUnreported = true;
      emit(onEvent, {
        type: "Text",
        text: `Verify gate: no git working tree to diff, and ${[...unreportedEditTools].join(", ")} may have changed files no tool reported, so verifying anyway.`,
      });
    }

    const wantVerify =
      verifyBeforeComplete &&
      (filesChanged.length > 0 || diffUnreadable || noDiffForUnreported);

    if (!wantVerify) {
      setState(onEvent, "done");
      return {
        summary,
        filesChanged,
        verified: false,
        verifySkipped: true,
        cancelled: false,
        state: "done",
        attempts,
      };
    }

    setState(onEvent, "verifying");
    emit(onEvent, {
      type: "Text",
      text: "Running fledge lanes run verify --non-interactive (includes spec-check)…",
    });

    if (isAborted(signal)) {
      return cancelledResult(summary, filesChanged, attempts);
    }

    let result;
    try {
      result = await verifyRunner(opts.cwd, signal);
    } catch (err) {
      if (isAborted(signal)) {
        return cancelledResult(summary, filesChanged, attempts);
      }
      result = {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
    // An aborted lane exits non-zero: that is a cancel, not a failed verify
    // (no retry, no stuck ask) — AGENT-3.
    if (isAborted(signal)) {
      return cancelledResult(summary, filesChanged, attempts);
    }

    emit(onEvent, {
      type: "VerifyResult",
      success: result.success,
      output: result.output,
    });

    if (result.success) {
      setState(onEvent, "done");
      return {
        summary,
        filesChanged,
        verified: true,
        verifySkipped: false,
        cancelled: false,
        state: "done",
        attempts,
      };
    }

    lastVerifyFailure = result.output;
    retries += 1;
    if (retries > maxRetries) {
      emit(onEvent, {
        type: "Text",
        text: `Verification failed after ${maxRetries} retries — giving up.`,
      });
      setState(onEvent, "failed");
      // AUTONOMY-2: stuck — still failed (AGENT-4), plus a question for a human.
      const ask = stuckAfterVerifyAsk(maxRetries);
      return {
        summary: `${summary}\n\nVerification failed after ${maxRetries} retries:\n${result.output}\n\n${formatAskSummary(ask)}`,
        filesChanged,
        verified: false,
        verifySkipped: false,
        cancelled: false,
        state: "failed",
        attempts,
        ask,
      };
    }

    emit(onEvent, {
      type: "Text",
      text: `Verify retry ${retries}/${maxRetries}…`,
    });
    // AGENT-4.a: the retry gets the failing step's output. Passing steps
    // (typecheck, a --help smoke) can fill the cap before a failing test, so
    // a long log keeps the failing step and the end, never its first chars.
    verifyFeedback = `${VERIFY_FEEDBACK_HEAD}${verifyFeedbackExcerpt(
      result.output,
      VERIFY_FEEDBACK_MAX_CHARS - VERIFY_FEEDBACK_HEAD.length,
    )}`;
    // loop → Executing
  }
}
