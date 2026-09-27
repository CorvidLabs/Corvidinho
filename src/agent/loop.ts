/**
 * Prove-before-done task loop (Merlin agent-loop Verifying steal).
 * Planning: SpecSync list/read via spec_loader (SPECSYNC-1/5).
 * Verifying: fledge lanes run verify (includes spec-check when wired).
 */

import {
  blockedTaskResult,
  formatAskSummary,
  stuckAfterVerifyAsk,
} from "./ask.ts";
import { loadAgentConfig } from "./config.ts";
import { loadRelevantSpecs } from "./specLoader.ts";
import { defaultVerifyRunner } from "./verify.ts";
import type {
  AgentEvent,
  AgentState,
  RunTaskOptions,
  TaskResult,
} from "./types.ts";

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

    const wantVerify =
      verifyBeforeComplete && filesChanged.length > 0;

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
    verifyFeedback = `Verification failed. Fix these errors and try again:\n\n${result.output}`;
    // loop → Executing
  }
}
