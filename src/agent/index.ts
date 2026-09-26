export type {
  AgentConfig,
  AgentEvent,
  AgentState,
  AgentTokenUsage,
  ExecuteContext,
  ExecuteFn,
  ExecuteResult,
  RunTaskOptions,
  TaskResult,
  VerifyResult,
  VerifyRunner,
} from "./types.ts";
export {
  agentConfigDefaults,
  loadAgentConfig,
  parseCorvidinhoSection,
} from "./config.ts";
export { defaultVerifyRunner, VERIFY_ARGS } from "./verify.ts";
export { runTask } from "./loop.ts";

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
  loadLlmEnv,
  UNKNOWN_TOOL_LABEL,
} from "./execute.ts";
export type { CreateTaskExecuteOpts, FetchLike, LlmEnv } from "./execute.ts";

export {
  loadTierFromEnv,
  parseCapabilityTier,
  tierAllowsPlugin,
  TIER_RANK,
} from "./tier.ts";
export type { CapabilityTier } from "./tier.ts";

export {
  argvFromToolArguments,
  buildOpenAiTools,
  filesChangedFromToolData,
} from "./tools.ts";
export type { BuildToolsOpts, OpenAiToolDef } from "./tools.ts";

export { summarizeTaskResult, summarizeTaskRunOutput } from "./task-summary.ts";
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
  parseSpendCap,
  priceForModel,
  SPEND_CAP_ENV,
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
  SpendWindow,
} from "./spend.ts";
