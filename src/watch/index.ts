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
  type WatchFatal,
} from "./poller.ts";
export {
  gateEvent,
  routeEvent,
  type EventGateResult,
  type RouterDeps,
} from "./router.ts";
export {
  containsMention,
  createFixtureSearchClient,
  createOctokitSearchClient,
  fetchWatchEvents,
  newestRequestActor,
  type FixtureBundle,
  type IssueEventLike,
  type RequestActorKind,
  type SearchClient,
} from "./searcher.ts";
export {
  issueKey,
  SessionStore,
  type WatchSessionStoreOptions,
} from "./session-store.ts";
export {
  NOT_AUTHORIZED,
  type DetectedEvent,
  type DetectedEventType,
  type RouteAction,
  type SessionStub,
  type WatchConfig,
} from "./types.ts";

export {
  ACK_CONTINUE,
  ACK_START,
  AckedIdStore,
  buildAckBody,
  createEchoAckClient,
  createOctokitAckClient,
  isAckableEventType,
  maybePostWatchAck,
  shouldAckEvent,
  type AckAttemptResult,
  type AckClient,
  type AckCommentResult,
} from "./ack.ts";

export {
  buildSummaryBody,
  maybePostWatchSummary,
  SuccessfulAckStore,
  SummarizedIdStore,
} from "./summary.ts";

export {
  classifySpawnError,
  createMemorySpawnOutcomeStore,
  defaultSpawnLogPath,
  formatSpawnOutcomeLog,
  formatSpawnStartLog,
  SpawnOutcomeStore,
  type MemorySpawnOutcomeStore,
  type SpawnErrorClass,
  type SpawnOutcome,
} from "./spawn-log.ts";

export {
  asGithubRateLimitError,
  computeRateLimitBackoffMs,
  DEFAULT_RATE_LIMIT_BACKOFF_MS,
  formatRateLimitLog,
  GithubRateLimitError,
  parseGithubRateLimit,
  type RateLimitBackoff,
  type RateLimitHeaders,
} from "./rate-limit.ts";
