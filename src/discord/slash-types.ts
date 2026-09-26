/**
 * Fixture-friendly slash interaction types (DISCORD-4).
 * Live gateway adapts discord.js → these shapes; tests inject memory replies.
 */

import type { AllowlistConfig } from "../allowlist/types.ts";
import type { AgentClient } from "./agent-client.ts";
import type { SessionStore } from "./session-store.ts";
import type { DiscordEmbedPayload, ThinkingOutbound } from "./thinking-status.ts";
import type { WorkStore } from "./work-store.ts";

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
  options: Record<string, SlashOptionValue>;
  reply: (opts: SlashReplyPayload) => Promise<void>;
  deferReply?: (opts?: { ephemeral?: boolean }) => Promise<void>;
  editReply?: (opts: SlashReplyPayload) => Promise<void>;
};

export type SlashContext = {
  store: SessionStore;
  workStore: WorkStore;
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
};

export type SlashResult =
  | { ok: true; handled: true }
  | { ok: false; reason: string; reply?: string };
