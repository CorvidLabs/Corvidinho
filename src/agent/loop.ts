/**
 * Prove-before-done task loop (Merlin agent-loop Verifying steal).
 * Planning: SpecSync list/read via spec_loader (SPECSYNC-1/5).
 * Verifying: fledge lanes run verify (includes spec-check when wired).
 * Gate trigger: tool-reported filesChanged OR a real worktree delta; every
 * result carries a plain verification line (AGENT-4 / FLEDGE-2, #85).
 */

import { loadAgentConfig } from "./config.ts";
import { loadRelevantSpecs } from "./specLoader.ts";
import { defaultVerifyRunner } from "./verify.ts";
import { withVerificationNote } from "./verify-report.ts";
import {
  gitWorkspaceProbe,
  type WorkspaceProbe,
  type WorkspaceSnapshot,
} from "./workspace-delta.ts";
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

async function safeSnapshot(
  probe: WorkspaceProbe | null,
  cwd: string,
): Promise<WorkspaceSnapshot | null> {
  if (!probe) return null;
  try {
    return await probe.snapshot(cwd);
  } catch {
    return null;
  }
}

async function safeChangedSince(
  probe: WorkspaceProbe | null,
  before: WorkspaceSnapshot | null,
): Promise<string[]> {
  if (!probe || !before) return [];
  try {
    return await probe.changedSince(before);
  } catch {
    return [];
  }
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
  const probe =
    opts.workspaceProbe === undefined ? gitWorkspaceProbe : opts.workspaceProbe;

  let summary = "";
  let filesChanged: string[] = [];
  let attempts = 0;
  let verifyFeedback: string | undefined;
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

  // Real worktree fingerprint so edits no tool reported still hit the gate.
  const baseline = await safeSnapshot(probe, opts.cwd);

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

    const worktreeDelta = await safeChangedSince(probe, baseline);
    if (filesChanged.length === 0 && worktreeDelta.length > 0) {
      emit(onEvent, {
        type: "Text",
        text: `Worktree changed (${worktreeDelta.length} path(s)) though no tool reported filesChanged — verify gate applies.`,
      });
    }
    const changed = filesChanged.length > 0 || worktreeDelta.length > 0;
    const wantVerify = verifyBeforeComplete && changed;

    if (!wantVerify) {
      setState(onEvent, "done");
      return {
        summary: withVerificationNote(summary, {
          kind: changed ? "gate-off" : "no-changes",
        }),
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
        summary: withVerificationNote(summary, { kind: "passed" }),
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
        summary: `${withVerificationNote(summary, { kind: "failed", retries: maxRetries })}\n\nVerification failed after ${maxRetries} retries:\n${result.output}`,
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
