export type {
  AgentConfig,
  AgentEvent,
  AgentState,
  AgentTokenUsage,
  ExecuteContext,
  ExecuteFn,
  ExecuteResult,
  HumanAsk,
  HumanAskReason,
  RunTaskOptions,
  SpendWarning,
  TaskResult,
  VerifyResult,
  VerifyRunner,
  WorkspaceDiffStart,
  WorkspaceDiffTracker,
} from "./types.ts";
export {
  agentConfigDefaults,
  loadAgentConfig,
  parseCorvidinhoSection,
  REMOVED_VERIFY_KEYS,
  removedVerifyKeys,
} from "./config.ts";
export { defaultVerifyRunner, VERIFY_ARGS } from "./verify.ts";
export { runTask } from "./loop.ts";
export {
  startWorkspaceDiff,
  WORKSPACE_DIFF_HASH_BUDGET_BYTES,
  WORKSPACE_DIFF_HASH_MAX_BYTES,
  WORKSPACE_DIFF_MAX_FILES,
  WORKSPACE_DIFF_MAX_OUTPUT_BYTES,
} from "./workspace-diff.ts";
export type { WorkspaceDiffLimits } from "./workspace-diff.ts";

export {
  extractConstraintSections,
  loadRelevantSpecs,
  selectRelevantSpecs,
} from "./specLoader.ts";
export type { LoadRelevantSpecsOptions, SpecRef } from "./specLoader.ts";

export { buildCorvidinhoArgv } from "./spawn-argv.ts";
export {
  createTaskExecute,
  extractUsage,
  MEMORY_AGENT_SYSTEM_INSTRUCTIONS,
  IDENTITY_AGENT_SYSTEM_INSTRUCTIONS,
  PUBLIC_QA_AGENT_SYSTEM_INSTRUCTIONS,
  DISCORD_CHAT_AGENT_SYSTEM_INSTRUCTIONS,
  TOOL_ROUNDS_EXHAUSTED_CLARIFY,
  softLandToolRoundExhaustion,
  loadLlmEnv,
  UNKNOWN_TOOL_LABEL,
} from "./execute.ts";
export type { CreateTaskExecuteOpts, FetchLike, LlmEnv } from "./execute.ts";

export {
  loadTierFromEnv,
  modelForTier,
  parseCapabilityTier,
  tierAllowsPlugin,
  TIER_MODEL_ENV,
  TIER_RANK,
} from "./tier.ts";
export type { CapabilityTier } from "./tier.ts";

export {
  entryLabel,
  modelChainForTier,
  NO_PROVIDER_NOTICE,
  parseModelChain,
  parseModelEntry,
  PROVIDER_KINDS,
  providerForTier,
  providerId,
  providerNotice,
  providerStatus,
  resolveEntry,
} from "./providers.ts";
export type { ModelEntry, ProviderKind, ProviderStatus, ResolvedProvider } from "./providers.ts";

export {
  argvFromToolArguments,
  buildOpenAiTools,
  filesChangedFromToolData,
} from "./tools.ts";
export type { BuildToolsOpts, OpenAiToolDef } from "./tools.ts";

export {
  ASK_AGENT_SYSTEM_INSTRUCTIONS,
  ASK_QUESTION_MAX,
  ASK_SUMMARY_PREFIX,
  ASK_TOOL_NAME,
  askFromToolArguments,
  askFromUnknown,
  buildAskToolDef,
  formatAskSummary,
  normalizeQuestion,
  stuckAfterVerifyAsk,
  withAskTool,
} from "./ask.ts";
export type { AskToolDef, AskToolOutcome, ChatToolDef } from "./ask.ts";

export {
  chatBodyFromTaskResult,
  chatBodyFromTaskRunOutput,
  formatTaskPlumbing,
  stripInternalStopReason,
  summarizeTaskResult,
  summarizeTaskRunOutput,
} from "./task-summary.ts";
export type { TaskResultSummaryInput } from "./task-summary.ts";

export {
  collectTaskRunStream,
  CORVIDINHO_PROTOCOL_VERSION,
  createNdjsonParser,
  createNdjsonWriter,
  frameFromEvent,
  NDJSON_LIMITS,
  parseNdjsonLine,
  progressFromFrame,
  protocolMismatchSummary,
  readNdjsonStream,
  resultFrame,
  serializeFrame,
  summarizeToolArgs,
  TASK_OUTPUT_MODES,
  usageFrame,
} from "./events-ndjson.ts";
export type {
  NdjsonEventFrame,
  NdjsonFrame,
  NdjsonLine,
  NdjsonParser,
  NdjsonResultFrame,
  NdjsonStreamOutcome,
  NdjsonUsageFrame,
  NdjsonWriter,
  ParseNdjsonOpts,
  TaskOutputMode,
  TaskProgress,
  TaskRunStreamOutcome,
} from "./events-ndjson.ts";

export {
  costMicroUsd,
  ensureSpendLedger,
  estimateCallMicroUsd,
  formatUsd,
  MODEL_PRICES_USD_PER_MTOK,
  createSpendGuard,
  parseSpendCap,
  priceForModel,
  readSpendSnapshot,
  SPEND_CAP_ENV,
  SPEND_WARN_PERCENT,
  SPEND_WINDOW_MS,
  SpendCapRefusal,
  spendDoctorCheck,
  SpendLedger,
  withSpendCap,
} from "./spend.ts";
export type {
  ModelPrice,
  SpendCap,
  SpendCapOptions,
  SpendDoctorLine,
  SpendGuard,
  SpendSnapshot,
  SpendWindow,
} from "./spend.ts";
export { createSpendAlertOutbox } from "./spend-outbox.ts";
export type { SpendAlertOutbox, SpendCapPingClaim, TakenSpendWarning } from "./spend-outbox.ts";
export {
  claimSpendCapPing,
  claimSpendWarnings,
  ensureSpendAlerts,
  releaseSpendCapPing,
  releaseSpendWarnings,
} from "./spend-alerts.ts";
export {
  formatSpendDoctorLine,
  formatSpendPublicStatusLine,
  formatSpendStatusLine,
  formatSpendWarningLine,
  SPEND_CAP_SUMMARY,
  SPEND_PAUSED_TEXT,
  spendPaused,
  SPEND_REARM_PERCENT,
  spendCapInvalidAsk,
  spendCapLedgerAsk,
  spendCapReachedAsk,
  spendCapUnpricedAsk,
  spendPercent,
  spendWarningFromUnknown,
} from "./spend-notice.ts";

export {
  describeProjectInstructions,
  findProjectRoot,
  loadProjectInstructions,
  NOT_COMMITTED_REASON,
  PROJECT_INSTRUCTION_FILES,
  PROJECT_INSTRUCTIONS_HEADER,
  PROJECT_INSTRUCTIONS_MAX_BYTES,
  projectInstructionsWarning,
  renderProjectInstructions,
  withProjectInstructions,
} from "./project-instructions.ts";
export type {
  LoadProjectInstructionsOptions,
  ProjectInstructionFile,
  ProjectInstructions,
} from "./project-instructions.ts";

export {
  CORVIDINHO_ROOT,
  loadPersona,
  PERSONA_FILE,
  PERSONA_HEADER,
  PERSONA_MAX_BYTES,
  PERSONA_RULES_SYSTEM_INSTRUCTIONS,
  personaWarning,
  renderPersona,
  withPersona,
} from "./persona.ts";
export type { LoadPersonaOptions, Persona } from "./persona.ts";

export {
  normalizeAskOptions,
  parseChoicesFromQuestion,
  resolveAskOptions,
  ASK_OPTIONS_MAX,
} from "./ask-options.ts";
export type { AskOption } from "./types.ts";
