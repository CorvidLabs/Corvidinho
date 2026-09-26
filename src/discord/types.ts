/**
 * HEAR thin types — inbound Discord messages + session stubs.
 * No ProcessManager; no voice/iced/Angular. Slash ops thin (DISCORD-4);
 * rate limits + mutes thin (DISCORD-6); admin re-auth (DISCORD-7);
 * confused-deputy post (DISCORD-8); image attachments (DISCORD-9);
 * protocol lockstep (DISCORD-10).
 */

import type { HumanAsk } from "../agent/types.ts";
import type { AllowlistConfig } from "../allowlist/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";

/** Discord file attachment metadata (DISCORD-9; corvid-agent shape). */
export type DiscordAttachment = {
  id: string;
  filename: string;
  content_type?: string;
  size: number;
  url: string;
  proxy_url?: string;
  width?: number;
  height?: number;
};

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
  /** File attachments (DISCORD-9). */
  attachments?: DiscordAttachment[];
};

export type SessionStub = {
  id: string;
  channelId: string;
  threadId?: string;
  userId: string;
  /** Optional topic from /session start or /work. */
  topic?: string;
  /**
   * Explicit project working directory for this talk (SESSION-WORKTREE-4).
   * Frozen for the talk lifetime — never silently switched mid-conversation.
   */
  project?: string;
  /** Isolated worktree or scoped-dir path (SESSION-WORKTREE-1). */
  worktreePath?: string;
  /** Branch name when kind=worktree. */
  worktreeBranch?: string;
  /** active | parked | removed */
  worktreeState?: "active" | "parked" | "removed";
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
   * IDENTITY-1 — durable owner from env CORVIDINHO_OWNER_* / allowlist
   * `[owner]` (null = no owner; admin lists unchanged). ADMIN-4 re-check.
   */
  owner?: OwnerRecord | null;
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
  /** The run needs a human (AUTONOMY-1/2): question + owner ping. */
  ask?: HumanAsk;
  /**
   * Verify facts from the child's `result` frame (AGENT-4); absent when no
   * frame parsed. /work ships a PR only from a verified tree (REQ-discord-088).
   */
  task?: { verified: boolean; verifySkipped: boolean; state?: string };
};

export const NOT_AUTHORIZED = "not authorized";
/**
 * Ephemeral tip for ADMIN slash deny outside allowlist (DISCORD-DENY-2).
 * Never post this publicly; MessageCreate has no ephemeral → silent there.
 */
export const ALLOWLIST_DENY_TIP =
  "This channel isn’t allowlisted. From an allowlisted channel run `/admin channels add` and search/pick it (live, no restart), or add its id to [discord].channels in ~/.config/corvidinho/allowlist.toml (or CORVIDINHO_DISCORD_ALLOW_CHANNELS / DISCORD_CHANNEL_IDS) and restart the bridge.";
/**
 * Ephemeral zero-width ack for non-admin slash deny (DISCORD-DENY-3).
 * Discord requires an interaction response within 3s; true zero response is
 * impossible for slash — this leaks nothing useful to the invoker only.
 */
export const EPHEMERAL_SILENT_ACK = "\u200b";
/** Short reply when the user is muted (DISCORD-6). */
export const MUTED = "You do not have permission to interact with this bot.";
/** Short reply when the user is rate-limited (DISCORD-6). */
export const RATE_LIMITED = "Slow down! Please wait before sending more messages.";
