export {
  CORVIDINHO_PROTOCOL_VERSION,
  checkProtocolVersion,
  enforceProtocolVersionOrExit,
} from "./protocol.ts";
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
} from "./permissions.ts";
export { SessionStore } from "./session-store.ts";
export { routeMessage, type RouterDeps } from "./message-router.ts";
export {
  createSpawnAgentClient,
  createEchoAgentClient,
  type AgentClient,
} from "./agent-client.ts";
export {
  createLiveGateway,
  createNullGateway,
  type DiscordGateway,
  type GatewayHandlers,
} from "./gateway.ts";
export { startBridge, type StartBridgeOptions, type StartBridgeResult } from "./bridge.ts";
export {
  NOT_AUTHORIZED,
  type InboundMessage,
  type SessionStub,
  type RouteAction,
  type BridgeConfig,
  type AgentSpawnResult,
} from "./types.ts";
