export {
  CORVIDINHO_PROTOCOL_VERSION,
  checkProtocolVersion,
  enforceProtocolVersionOrExit,
} from "./protocol-version.ts";
export {
  SUPPORTED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGES_PER_MESSAGE,
  IMAGE_CACHE_DIR,
  FETCH_TIMEOUT_MS,
  isImageAttachment,
  extractImageBlocks,
  appendAttachmentUrls,
  buildMultimodalContent,
  enrichPromptWithImages,
  type ImageContentBlock,
  type TextContentBlock,
  type ContentBlock,
  type ExtractedImages,
  type MaterializedImage,
} from "./image-attachments.ts";
export {
  loadBridgeConfig,
  mergeChannelIds,
  goLiveChecklist,
  type ConfigResult,
  type ConfigError,
  type ConfigOk,
} from "./config.ts";
export {
  isMonitoredChannel,
  gateChannel,
  gateInbound,
  checkChannel,
  checkRole,
  checkUser,
  checkDiscordAction,
  checkRateLimit,
  muteUser,
  unmuteUser,
  isMuted,
  gateRateOrMute,
  defaultRateLimitConfig,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_RATE_LIMIT_MAX_MESSAGES,
  PermissionLevel,
  resolvePermissionLevel,
  type RateLimitConfig,
  type RateLimitState,
  type ResolvePermissionOpts,
} from "./permissions.ts";
export {
  evaluateRequesterCanSend,
  verifyRequesterCanSend,
  setRequesterPermCheckerForTests,
  requesterCheckFix,
  type RequesterCheckResult,
  type ChannelPermProbe,
  type RequesterPermChecker,
} from "./requester-perms.ts";
export { SessionStore } from "./session-store.ts";
export { WorkStore, type WorkTaskStub, type WorkTaskStatus } from "./work-store.ts";
export { routeMessage, type RouterDeps } from "./message-router.ts";
export {
  createSpawnAgentClient,
  createEchoAgentClient,
  type AgentClient,
  type AgentStatusUpdate,
  type AgentRunChatOpts,
  type EchoAgentClientOpts,
} from "./agent-client.ts";
export {
  createLiveGateway,
  createNullGateway,
  type DiscordGateway,
  type GatewayHandlers,
} from "./gateway.ts";
export {
  startBridge,
  memoryThinkingOutbound,
  type StartBridgeOptions,
  type StartBridgeResult,
} from "./bridge.ts";
export {
  THINKING_COLORS,
  formatElapsed,
  formatTokenCount,
  formatTokenSegment,
  buildThinkingFooter,
  buildThinkingEmbed,
  ThinkingStatus,
  type ThinkingPhase,
  type ThinkingTokens,
  type ThinkingSnapshot,
  type DiscordEmbedPayload,
  type ThinkingOutbound,
  type ThinkingStatusOpts,
} from "./thinking-status.ts";
export {
  buildSlashCommandBodies,
  SLASH_COMMAND_NAMES,
  OPT_SUB_COMMAND,
  OPT_STRING,
  OPT_USER,
  type SlashCommandBody,
  type SlashCommandName,
} from "./slash-commands.ts";
export {
  registerSlashCommandSet,
  registerSlashCommandsLive,
  applicationGuildCommandsRoute,
  applicationCommandsRoute,
  type PutCommandsFn,
  type RegisterSlashCommandSetOpts,
  type RegisterSlashCommandSetResult,
  type LiveRegisterOpts,
} from "./register-commands.ts";
export {
  handleSlashInteraction,
  knownSlashCommands,
} from "./slash-dispatch.ts";
export {
  formatStatusReport,
  formatUptime,
} from "./command-handlers/status.ts";
export type {
  SlashInteraction,
  SlashContext,
  SlashResult,
  SlashOptionValue,
  SlashReplyPayload,
} from "./slash-types.ts";
export {
  NOT_AUTHORIZED,
  MUTED,
  RATE_LIMITED,
  type DiscordAttachment,
  type InboundMessage,
  type SessionStub,
  type RouteAction,
  type BridgeConfig,
  type AgentSpawnResult,
} from "./types.ts";
