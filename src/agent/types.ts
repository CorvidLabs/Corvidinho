/**
 * Prove-before-done agent types (Merlin AGENT-3/4/5/8 steal).
 * Lean: OpenAI-compatible tool loop; no Trust/attest.
 */

import type { RepoWays } from "./repo-ways.ts";
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
 * Provider-reported token totals of one configured model (AGENT-11): `model`
 * is its entry label (`entryLabel`: the bare model for `openai`, else
 * `kind:model`), so each model's tokens are priced at its own price.
 */
export type ModelUsage = AgentTokenUsage & { model: string };

/**
 * One failover (AGENT-11): the configured model `from` failed for `reason`
 * (a short fixed text such as `HTTP 404` or `timed out`, never provider
 * output) and the run went on with the next configured model `to`. Both are
 * entry labels. `via` marks a failover inside a `delegate` or `council`
 * worker this run started, rather than in its own model chain.
 */
export type ModelFallback = {
  from: string;
  to: string;
  reason: string;
  via?: "delegate" | "council";
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
  /**
   * `spend-cap` only (SAFE-14 / SAFE-15): the cap scope(s) the stopped call
   * would have passed — `total` or `provider:<id>` — so a bridge pings the
   * owner once per episode of each cap. Never shown to anyone but the owner
   * (SAFE-14.a). Absent: the total cap (older frames, a bad setting, no ledger).
   */
  spendScopes?: string[];
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
   * DISCORD-3.b / AGENT-9: with `error`, why the attempt failed as one plain
   * harness line — the no-provider notice (AGENT-10) or which model call
   * failed and how (`modelCallFailedLine`); never model or tool output.
   */
  failureReason?: string;
  /**
   * AGENT-12 (REQ-agent-312): the attempt used up its turn cap
   * (`CORVIDINHO_MAX_TURNS` model↔tool rounds) and ended with its best prose
   * so far (AGENT-9).
   */
  stopReason?: "turn-cap";
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
  /**
   * AGENT-18 (REQ-agent-518): the ways this repo works, read at planning from
   * the session base, HEAD and the working tree; the tool loop adds one fixed
   * prompt block for them. Absent when none was found.
   */
  repoWays?: RepoWays;
  /**
   * AGENT-17 (REQ-agent-087): the verify gate's real git diff since the
   * run's baseline (`WorkspaceDiffTracker.changed`), for the tool loop's
   * "nothing changed" check; null when git cannot be read. Absent with no
   * git tree (tool-reported changes decide).
   */
  workspaceChanged?: () => Promise<string[] | null>;
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

/**
 * Why a run was stopped by a limit I set (AGENT-12): `turn-cap` — its final
 * attempt used up `CORVIDINHO_MAX_TURNS` rounds (REQ-agent-312);
 * `idle-timeout` — no output for `CORVIDINHO_IDLE_TIMEOUT_MS` (REQ-agent-244).
 */
export type TaskStopReason = "turn-cap" | "idle-timeout";

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
  /**
   * MEMORY-7.a (REQ-agent-710 / REQ-cli-710): text shown only privately to
   * the person who asked — private notes, a profile, the owner's view of
   * someone's memory — that the model never saw. The Discord bridge sends it
   * by direct message and never posts it in the channel. Absent when none.
   */
  privateReplies?: string[];
  /**
   * AGENT-11: the configured model (entry label) whose reply the run ended
   * on — the one that answered. Absent when no model answered.
   */
  model?: string;
  /**
   * Provider-reported token totals per configured model (AGENT-11), in the
   * order each first reported usage. Absent when no usage was reported.
   */
  usageByModel?: ModelUsage[];
  /**
   * AGENT-11: every failover of this run, in order — its own model chain's
   * and (with `via`) those of the delegate or council workers it started.
   * Absent when no model failed over.
   */
  modelFallback?: ModelFallback[];
  /**
   * AGENT-12: a limit I set stopped the run (additive; no protocol change).
   * Bridges show it only as `stopped=…` in the footer / thinking plumbing
   * (`formatTaskPlumbing`), never in a Discord channel body (AGENT-9,
   * DISCORD-3.a); WATCH comments and the CLI's human output add a plain note.
   * Absent when no limit stopped it.
   */
  stopReason?: TaskStopReason;
  /**
   * DISCORD-3.b / AGENT-9: a failed run's reason as one plain line of harness
   * text (the no-provider notice, which model call failed and how, which
   * verify failed, or AGENT-12's `Stopped: no output for 10 minutes (idle
   * timeout).`) — never model or tool output (SAFE-12/13). Bridges show it
   * to the owner only, after a secret scrub. Absent on a run that did not
   * fail, and on a failure that names no reason. Additive: no protocol bump.
   */
  error?: string;
  /**
   * SESSION-WORKTREE-1.a (REQ-cli-122): the worktree a local `task run`
   * worked in and whether it and its branch were kept (additive; no protocol
   * change). Absent when the run worked in place: `--here`, a directory that
   * is not in a git repo, or a child a product surface spawned.
   */
  workspace?: TaskWorkspaceReport;
};

/** What became of a local `task run`'s own worktree at the end of the run (REQ-cli-122). */
export type TaskWorkspaceReport = {
  /** The linked worktree the run worked in. */
  dir: string;
  /**
   * The branch the worktree was on at the end: its own `talk/cli_…`, or a
   * branch the run made and switched to (`git-branch-create`).
   */
  branch: string;
  /** The worktree is still there (not clean, or it could not be removed). */
  kept: boolean;
  /** The branch is still there (it has commits of its own, or its worktree was kept). */
  branchKept: boolean;
};

/**
 * SAFE-8 / SAFE-15 80% warning (#98): integer micro-USD so bridges format it
 * from numbers, never from child-written text.
 */
export type SpendWarning = {
  /** Spend counted in the rolling 24 h window when the warning fired. */
  spentMicroUsd: number;
  capMicroUsd: number;
  /** floor(spent × 100 / cap). */
  percent: number;
  /**
   * SAFE-14 / SAFE-15: `provider:<id>` for a provider cap's warning (that
   * provider's spend against its cap); absent for the total cap.
   */
  scope?: string;
  /**
   * SAFE-16 / SAFE-16.a: calls in the same window whose price is unknown
   * (each approved on a spend card); the owner's line then reads
   * "$X + unknown", never a plain $X. Absent when there are none.
   */
  unknownCalls?: number;
};

/**
 * `[corvidinho]` settings from the project's fledge.toml. There is no key
 * that turns the verify gate off (AGENT-14, REQ-agent-003).
 */
export type AgentConfig = {
  maxRetries: number;
};

/**
 * A test the run deleted or turned off (AGENT-15, REQ-agent-185): its name
 * and the file (relative to the project root) that declared it before.
 */
export type TestDrop = { name: string; file: string };

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
  /**
   * AGENT-15 (REQ-agent-185): tests at the baseline that are gone, or run
   * less than they did, by name across the whole repo root (a test moved to
   * another file keeps its name); null when git or a test file could not be
   * read, so the run is not verified (fail closed).
   */
  testDrops(): Promise<TestDrop[] | null>;
  /**
   * AGENT-15.a (REQ-agent-015): the last run in this talk worktree did not
   * end verified, so the baseline is the talk branch's merge-base and every
   * edit since the talk started counts, including ones an earlier attempt
   * left.
   */
  carried?: boolean;
  /**
   * Talk worktrees only: record how the run ended. `done` (verified, or
   * nothing to verify) lets the next run there start from its own snapshot;
   * anything else makes it carry the baseline.
   */
  settle?(done: boolean): void;
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
  maxRetries?: number;
  verifyRunner?: VerifyRunner;
  /**
   * Test seam (like `verifyRunner`, not a product surface): starts the real
   * git working-tree diff that fills `filesChanged` (REQ-agent-085). Default
   * `startWorkspaceDiff`; `task run` in a delegate or council worker passes
   * it with `{ nested: true }` (REQ-agent-015).
   */
  workspaceDiff?: WorkspaceDiffStart;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  /**
   * AGENT-12 (REQ-agent-244): stop the run after this long with no output
   * (default `DEFAULT_IDLE_TIMEOUT_MS`, 10 min; `task run` passes
   * `CORVIDINHO_IDLE_TIMEOUT_MS`).
   */
  idleTimeoutMs?: number;
  /** Config loaded from fledge.toml; used as defaults when overrides omitted. */
  config?: AgentConfig;
};
