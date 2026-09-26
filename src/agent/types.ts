/**
 * Prove-before-done agent types (Merlin AGENT-3/4/5/8 steal).
 * Lean: OpenAI-compatible tool loop; no Trust/attest.
 */

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
 * called ask-human; `stuck` = the runner gave up (verify retries exhausted).
 */
export type HumanAskReason = "clarify" | "stuck";

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
};

export type ExecuteContext = {
  attempt: number;
  verifyFeedback?: string;
  signal: AbortSignal;
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
};

export type AgentConfig = {
  verifyBeforeComplete: boolean;
  maxRetries: number;
};

export type RunTaskOptions = {
  cwd: string;
  /** Task description for Planning SpecSync briefing (Merlin spec_loader). */
  task?: string;
  execute: ExecuteFn;
  /** Override config; when false, skip verify gate. */
  verifyBeforeComplete?: boolean;
  maxRetries?: number;
  verifyRunner?: VerifyRunner;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  /** Config loaded from fledge.toml; used as defaults when overrides omitted. */
  config?: AgentConfig;
};
