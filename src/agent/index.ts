export type {
  AgentConfig,
  AgentEvent,
  AgentState,
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
  MEMORY_AGENT_SYSTEM_INSTRUCTIONS,
  loadLlmEnv,
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

export { summarizeTaskRunOutput } from "./task-summary.ts";

export {
  describeProjectInstructions,
  findProjectRoot,
  loadProjectInstructions,
  PROJECT_INSTRUCTION_FILES,
  PROJECT_INSTRUCTIONS_HEADER,
  PROJECT_INSTRUCTIONS_MAX_BYTES,
  renderProjectInstructions,
  withProjectInstructions,
} from "./project-instructions.ts";
export type {
  LoadProjectInstructionsOptions,
  ProjectInstructionFile,
  ProjectInstructions,
} from "./project-instructions.ts";
