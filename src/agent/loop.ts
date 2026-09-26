/**
 * Prove-before-done task loop (Merlin agent-loop Verifying steal).
 * Refuses verified=true until fledge verify passes when the gate is on.
 */

import { loadAgentConfig } from "./config.ts";
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
  let retries = 0;

  setState(onEvent, "planning");
  if (isAborted(signal)) {
    return cancelledResult(summary, filesChanged, attempts);
  }

  // Brief planning note (AGENT-2 briefing hook — lean: no spec load yet)
  emit(onEvent, {
    type: "Text",
    text: "Planning: ready to execute (specs briefing deferred to later slice).",
  });

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
    });
    summary = exec.summary;
    filesChanged = [...exec.filesChanged];

    if (isAborted(signal)) {
      return cancelledResult(summary, filesChanged, attempts);
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
      text: "Running fledge lanes run verify --non-interactive…",
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

    retries += 1;
    if (retries > maxRetries) {
      emit(onEvent, {
        type: "Text",
        text: `Verification failed after ${maxRetries} retries — giving up.`,
      });
      setState(onEvent, "failed");
      return {
        summary: `${summary}\n\nVerification failed after ${maxRetries} retries:\n${result.output}`,
        filesChanged,
        verified: false,
        verifySkipped: false,
        cancelled: false,
        state: "failed",
        attempts,
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
