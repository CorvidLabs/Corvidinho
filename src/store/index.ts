/**
 * Shared local store helpers (SESSION durable + DISCORD-SCHEDULE + MEMORY #41/#59;
 * retained condensed conversations, SESSION-5/6 / AGENT-6.a #72).
 */

export {
  DEFAULT_DATA_DIR_REL,
  defaultDbPath,
  resolveDataDir,
  type DataDirOptions,
} from "./paths.ts";
export {
  SCHEMA_VERSION,
  migrateCorvidinhoDb,
  openCorvidinhoDb,
  type OpenDbOptions,
} from "./db.ts";
export {
  SESSION_TTL_DEFAULT_MS,
  SESSION_TTL_MAX_MS,
  SESSION_TTL_MIN_MS,
  clampSessionTtlMs,
  isSessionExpired,
  resolveSessionTtlMs,
} from "./session-ttl.ts";
export {
  CONVERSATION_RETENTION_MS,
  ConversationStore,
  condenseBudgetChars,
  forgetConversations,
  resolveContextWindowTokens,
} from "./conversation.ts";
