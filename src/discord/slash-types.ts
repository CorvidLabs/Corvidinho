/**
 * Fixture-friendly slash interaction types (DISCORD-4).
 * Live gateway adapts discord.js → these shapes; tests inject memory replies.
 */

import type { AllowlistConfig } from "../allowlist/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import type { AgentClient } from "./agent-client.ts";
import type { SessionStore } from "./session-store.ts";
import type { DiscordEmbedPayload, ThinkingOutbound } from "./thinking-status.ts";
import type { RateLimitConfig, RateLimitState } from "./permissions.ts";
import type { WorkStore } from "./work-store.ts";
import type { ScheduleStore } from "../scheduler/store.ts";
import type { MemoryStore } from "../memory/index.ts";
import type { AnnounceStore } from "./announce-store.ts";

export type SlashOptionValue = string | number | boolean | null;

export type SlashReplyPayload = {
  content?: string;
  ephemeral?: boolean;
  embeds?: DiscordEmbedPayload[];
};

export type SlashInteraction = {
  id: string;
  commandName: string;
  /** Present for /session list|start. */
  subcommand?: string;
  channelId: string;
  guildId?: string;
  userId: string;
  /** Member role ids for DISCORD-7 permission resolve (optional). */
  roleIds?: string[];
  options: Record<string, SlashOptionValue>;
  reply: (opts: SlashReplyPayload) => Promise<void>;
  deferReply?: (opts?: { ephemeral?: boolean }) => Promise<void>;
  editReply?: (opts: SlashReplyPayload) => Promise<void>;
};

export type SlashContext = {
  store: SessionStore;
  workStore: WorkStore;
  /** DISCORD-SCHEDULE — optional until bridge wires it. */
  scheduleStore?: ScheduleStore;
  /** MEMORY store (REQ-discord-021). */
  memoryStore?: MemoryStore;
  /** DISCORD-ANNOUNCE — optional until bridge wires it. */
  announceStore?: AnnounceStore;
  allowlist: AllowlistConfig;
  agent: AgentClient;
  version: string;
  protocolVersion: number;
  /** Bridge process start time (ms). */
  startedAt: number;
  channelIds: string[];
  thinkingOutbound?: ThinkingOutbound;
  thinkingDebounceMs?: number;
  thinkingTickMs?: number;
  /** Track bot reply message ids for DISCORD-2 continuity after slash start/work. */
  trackBotMessage?: (messageId: string, sessionId: string) => void;
  /** DISCORD-6 — shared with message path. */
  mutedUsers?: Set<string>;
  rateLimitState?: RateLimitState;
  rateLimitConfig?: RateLimitConfig;
  /** Optional numeric permission level for rateLimitByLevel. */
  permLevelFor?: (userId: string) => number | undefined;
  /** DISCORD-7 admin lists (empty = nobody ADMIN). */
  adminUserIds?: string[];
  adminRoleIds?: string[];
  /** IDENTITY-1 — configured owner (ADMIN unless muted/deny-listed). */
  owner?: OwnerRecord | null;
  /** Optional env for LLM status line (tests inject). */
  env?: NodeJS.ProcessEnv;
  /** Optional git tip short SHA (bridge fills best-effort). */
  gitTipSha?: string;
};

export type SlashResult =
  | { ok: true; handled: true }
  | { ok: false; reason: string; reply?: string };
