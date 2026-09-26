/**
 * HEAR thin types — inbound Discord messages + session stubs.
 * No ProcessManager; no voice/iced/Angular. Slash ops thin (DISCORD-4);
 * rate limits + mutes thin (DISCORD-6); admin re-auth (DISCORD-7);
 * confused-deputy post (DISCORD-8).
 */

import type { AllowlistConfig } from "../allowlist/types.ts";

export type InboundMessage = {
  id: string;
  channelId: string;
  /** Present when message is inside a thread (DISCORD-2.a). */
  threadId?: string;
  guildId?: string;
  authorId: string;
  authorBot: boolean;
  content: string;
  /** True when the bot user is @mentioned. */
  mentionedBot: boolean;
  /** Message id this message replies to, if any. */
  referencedMessageId?: string;
  /** Role ids of the author (optional; empty user/role lists deny when checked). */
  authorRoleIds?: string[];
};

export type SessionStub = {
  id: string;
  channelId: string;
  threadId?: string;
  userId: string;
  /** Optional topic from /session start or /work. */
  topic?: string;
  createdAt: number;
  lastActivityAt: number;
};

export type RouteAction =
  | { kind: "ignore"; reason: string }
  | { kind: "refuse"; reason: string; reply?: string }
  | {
      kind: "start_session";
      session: SessionStub;
      prompt: string;
    }
  | {
      kind: "continue_session";
      session: SessionStub;
      prompt: string;
    };

export type BridgeConfig = {
  /** Discord bot token (never logged). */
  token: string;
  /** Non-empty allowlisted channel ids (required to start). */
  channelIds: string[];
  allowlist: AllowlistConfig;
  /** Path/bin for corvidinho CLI spawn. */
  corvidinhoBin: string;
  projectRoot: string;
  /** Optional guild id for fast slash command registration. */
  guildId?: string;
  /** Per-user rate limit (DISCORD-6). Defaults: 10 / 60s. */
  rateLimitWindowMs: number;
  rateLimitMaxMessages: number;
  /** Optional tiered overrides keyed by numeric permission level. */
  rateLimitByLevel?: Record<number, number>;
  /** Seed muted Discord user ids (in-memory; DISCORD-6). */
  mutedUserIds: string[];
  /** DISCORD-7 admin snowflakes (empty = nobody ADMIN; default-deny). */
  adminUserIds: string[];
  adminRoleIds: string[];
  /**
   * DISCORD-8 — when true, discord-post-message refuses without
   * requesting_user_id (Merlin require_requester_check analogue).
   */
  requireRequesterCheck: boolean;
  /** When true, skip live discord.js connect (tests). */
  dryRun?: boolean;
};

export type AgentSpawnResult = {
  ok: boolean;
  sessionId: string;
  summary: string;
  exitCode: number;
};

export const NOT_AUTHORIZED = "not authorized";
/** Short reply when the user is muted (DISCORD-6). */
export const MUTED = "You do not have permission to interact with this bot.";
/** Short reply when the user is rate-limited (DISCORD-6). */
export const RATE_LIMITED = "Slow down! Please wait before sending more messages.";
