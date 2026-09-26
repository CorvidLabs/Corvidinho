/**
 * WATCH — GitHub mention/review ingress (poll-first for bot/VM).
 */

export {
  expandWatchRepos,
  goLiveChecklist,
  loadWatchConfig,
  type ConfigResult,
} from "./config.ts";
export {
  dedupeByIssue,
  filterNewEvents,
  ProcessedIdStore,
} from "./dedup.ts";
export {
  createEchoAgentClient,
  createSpawnAgentClient,
  type AgentClient,
} from "./agent-client.ts";
export {
  startWatchPoller,
  type PollCycleResult,
  type StartWatchOptions,
  type StartWatchResult,
} from "./poller.ts";
export { routeEvent, type RouterDeps } from "./router.ts";
export {
  containsMention,
  createFixtureSearchClient,
  createOctokitSearchClient,
  fetchWatchEvents,
  type FixtureBundle,
  type SearchClient,
} from "./searcher.ts";
export { issueKey, SessionStore } from "./session-store.ts";
export {
  NOT_AUTHORIZED,
  type DetectedEvent,
  type DetectedEventType,
  type RouteAction,
  type SessionStub,
  type WatchConfig,
} from "./types.ts";
