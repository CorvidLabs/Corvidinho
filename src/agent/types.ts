/**
 * Prove-before-done agent types (Merlin AGENT-3/4/5/8 steal).
 * Lean: OpenAI-compatible tool loop; no Trust/attest.
 */

import type { InjectionNotice } from "./untrusted.ts";

export type AgentState =
  | "idle"
  | "planning"
  | "executing"
  | "verifying"
  | "done"
  | "failed"
  /** Stopped to ask the human a clarifying question (AUTONOMY-1). */
  | "blocked";

export type AgentEvent =
  | { type: "StateChanged"; state: AgentState }
  | { type: "Text"; text: string }
  | { type: "ToolCall"; name: string; args: string }
  | { type: "ToolResult"; name: string; success: boolean; detail?: string }
  | { type: "VerifyResult"; success: boolean; output: string };

/**
 * Running token totals reported by the OpenAI-compatible provider (`usage`).
 * Kept out of AgentEvent so `task run --json` events stay frozen; streamed as
 * a `usage` NDJSON frame (REQ-agent-073).
 */
export type AgentTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

/**
 * Why a run stopped for a human (AUTONOMY-1/2, #44): `clarify` = the agent
 * called ask-human; `stuck` = the runner gave up (verify retries exhausted);
 * `spend-cap` = the next provider call would pass the daily spend cap, so the
 * runner stopped before sending it and asks the owner (SAFE-8, #98).
 */
export type HumanAskReason = "clarify" | "stuck" | "spend-cap";

/** One selectable choice for Discord button asks (DISCORD-ASK-1). */
export type AskOption = {
  /** Stable id for button custom_id (short, no spaces). */
  id: string;
  /** Human-visible label (Discord button label ≤80 chars). */
  label: string;
};

/** A question surfaced to the requester; bridges also ping the owner. */
export type HumanAsk = {
  reason: HumanAskReason;
  question: string;
  /**
   * Structured choices for ephemeral Discord buttons (DISCORD-ASK-1).
   * When absent, bridges may parse numbered lists from `question`, or fall
   * back to free-text clarify (DISCORD-ASK-4).
   */
  options?: AskOption[];
};

export type ExecuteResult = {
  summary: string;
  filesChanged: string[];
  /** Set when the tool loop stopped to ask the human (ask-human). */
  ask?: HumanAsk;
  /**
   * Set when the attempt failed outright (provider / HTTP / network error,
   * malformed reply): runTask ends the run "failed", never "done" (AGENT-4/8).
   */
  error?: boolean;
  /**
   * Tools the attempt ran whose file edits no tool result reports (a Fledge
   * command, the shell or a runner, or a `delegate` worker that may have run
   * an allowlisted Fledge command). With no git snapshot to diff, runTask
   * runs verify anyway (AGENT-4, REQ-agent-502).
   */
  unreportedEditTools?: string[];
};

export type ExecuteContext = {
  attempt: number;
  verifyFeedback?: string;
  signal: AbortSignal;
  /**
   * Planning SpecSync briefing (REQ-agent-004, AGENT-2 / SPECSYNC-1/5): the
   * relevant module constraints and companions, passed on every attempt so
   * the model sees them. Project data, not instructions. Absent when none.
   */
  specBriefing?: string;
};

export type ExecuteFn = (ctx: ExecuteContext) => Promise<ExecuteResult>;

export type VerifyResult = {
  success: boolean;
  output: string;
};

export type VerifyRunner = (
  cwd: string,
  signal?: AbortSignal,
) => Promise<VerifyResult>;

export type TaskResult = {
  summary: string;
  filesChanged: string[];
  verified: boolean;
  verifySkipped: boolean;
  cancelled: boolean;
  state: AgentState;
  attempts: number;
  /** Present only when the run needs a human answer (AUTONOMY-1/2). */
  ask?: HumanAsk;
  /**
   * Present when this run pushed rolling 24 h spend to the SAFE-8 warning
   * threshold (80% of the daily cap). Recorded once per crossing.
   */
  spendWarning?: SpendWarning;
  /**
   * SAFE-13: a tool result in this run looked like a prompt-injection attempt
   * (the tool and reason ids only); the run dropped its mutating tools and
   * the surface tells the owner.
   */
  injection?: InjectionNotice;
};

/**
 * SAFE-8 80% warning (#98): integer micro-USD so bridges format it from
 * numbers, never from child-written text.
 */
export type SpendWarning = {
  /** Spend counted in the rolling 24 h window when the warning fired. */
  spentMicroUsd: number;
  capMicroUsd: number;
  /** floor(spent × 100 / cap). */
  percent: number;
};

export type AgentConfig = {
  verifyBeforeComplete: boolean;
  maxRetries: number;
};

/**
 * The run's real on-disk changes for the verify gate (AGENT-4,
 * REQ-agent-085), measured from a git snapshot taken before the first attempt.
 */
export type WorkspaceDiffTracker = {
  /**
   * Paths (relative to the run cwd) that changed since the snapshot; null
   * when git could not be read, so the gate verifies anyway (fail closed).
   */
  changed(): Promise<string[] | null>;
};

/**
 * Snapshot `cwd`'s git project; null when it is not in a git work tree (the
 * gate then uses tool-reported files only).
 */
export type WorkspaceDiffStart = (cwd: string) => Promise<WorkspaceDiffTracker | null>;

export type RunTaskOptions = {
  cwd: string;
  /** Task description for Planning SpecSync briefing (Merlin spec_loader). */
  task?: string;
  execute: ExecuteFn;
  /** Override config; when false, skip verify gate. */
  verifyBeforeComplete?: boolean;
  maxRetries?: number;
  verifyRunner?: VerifyRunner;
  /**
   * Test seam (like `verifyRunner`, not a product surface): starts the real
   * git working-tree diff the verify gate adds to `filesChanged`
   * (REQ-agent-085). Default `startWorkspaceDiff`.
   */
  workspaceDiff?: WorkspaceDiffStart;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  /** Config loaded from fledge.toml; used as defaults when overrides omitted. */
  config?: AgentConfig;
};
