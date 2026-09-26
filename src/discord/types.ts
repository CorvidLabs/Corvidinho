/**
 * HEAR thin types — inbound Discord messages + session stubs.
 * No ProcessManager; no voice/iced/Angular. Slash ops are thin (DISCORD-4).
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
