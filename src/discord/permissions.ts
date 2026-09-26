/**
 * DISCORD-5 — allowlisted channels via existing allowlist helpers.
 * DISCORD-6 — per-user rate limits + mutes (thin steal from corvid-agent).
 */

import {
  checkChannel,
  checkDiscordAction,
  checkRole,
  checkUser,
} from "../allowlist/discord.ts";
import type { AllowlistConfig, GateResult } from "../allowlist/types.ts";
import { MUTED, NOT_AUTHORIZED, RATE_LIMITED } from "./types.ts";

/** Ancestor default: 10 messages / 60s window. */
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_RATE_LIMIT_MAX_MESSAGES = 10;

export type RateLimitConfig = {
  windowMs: number;
  maxMessages: number;
  /** Optional per-level override (ancestor `rateLimitByLevel`). */
  rateLimitByLevel?: Record<number, number>;
};

export type RateLimitState = {
  userMessageTimestamps: Map<string, number[]>;
};

export function defaultRateLimitConfig(
  over: Partial<RateLimitConfig> = {},
): RateLimitConfig {
  return {
    windowMs: over.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
    maxMessages: over.maxMessages ?? DEFAULT_RATE_LIMIT_MAX_MESSAGES,
    rateLimitByLevel: over.rateLimitByLevel,
  };
}

export function isMonitoredChannel(
  channelId: string,
  cfg: AllowlistConfig,
): boolean {
  return checkChannel(channelId, cfg).ok;
}

export function gateChannel(
  channelId: string,
  cfg: AllowlistConfig,
): GateResult {
  const r = checkChannel(channelId, cfg);
  if (r.ok) return r;
  return { ok: false, error: r.error.startsWith("not authorized") ? r.error : `${NOT_AUTHORIZED}: ${r.error}` };
}

/**
 * Channel must pass; if userId/roles provided, user OR any role must pass.
 * When user/role lists are empty, checkUser/checkRole deny (default-deny).
 */
export function gateInbound(
  opts: {
    channelId: string;
    userId?: string;
    roleIds?: string[];
    /** When true, only channel is checked (listen path). */
    channelOnly?: boolean;
  },
  cfg: AllowlistConfig,
): GateResult {
  if (opts.channelOnly) {
    return gateChannel(opts.channelId, cfg);
  }
  return checkDiscordAction(
    {
      channelId: opts.channelId,
      userId: opts.userId,
      roleIds: opts.roleIds,
    },
    cfg,
  );
}

/**
 * Check if a user is within their rate limit (ancestor checkRateLimit).
 * Returns true if allowed (and records the timestamp); false if rate-limited.
 * Limiting one user does not affect another (DISCORD-6).
 */
export function checkRateLimit(
  state: RateLimitState,
  userId: string,
  config: RateLimitConfig,
  permLevel?: number,
  nowMs: number = Date.now(),
): boolean {
  const timestamps = state.userMessageTimestamps.get(userId) ?? [];
  const recent = timestamps.filter((t) => nowMs - t < config.windowMs);

  let maxMessages = config.maxMessages;
  if (permLevel !== undefined && config.rateLimitByLevel?.[permLevel] !== undefined) {
    maxMessages = config.rateLimitByLevel[permLevel]!;
  }

  if (recent.length >= maxMessages) {
    state.userMessageTimestamps.set(userId, recent);
    return false;
  }
  recent.push(nowMs);
  state.userMessageTimestamps.set(userId, recent);
  return true;
}

export function isMuted(mutedUsers: Set<string>, userId: string): boolean {
  return mutedUsers.has(userId);
}

/** Mute a user from bot interactions. Admin/ops action (in-memory). */
export function muteUser(mutedUsers: Set<string>, userId: string): void {
  mutedUsers.add(userId);
}

/** Unmute a user. Admin/ops action (in-memory). */
export function unmuteUser(mutedUsers: Set<string>, userId: string): void {
  mutedUsers.delete(userId);
}

/**
 * Gate mute then rate limit for a user about to interact.
 * Returns null when allowed; otherwise a refuse-shaped result.
 */
export function gateRateOrMute(
  opts: {
    userId: string;
    mutedUsers?: Set<string>;
    rateLimit?: { state: RateLimitState; config: RateLimitConfig; permLevel?: number };
    nowMs?: number;
  },
): { ok: true } | { ok: false; reason: "muted" | "rate_limited"; reply: string } {
  if (opts.mutedUsers && isMuted(opts.mutedUsers, opts.userId)) {
    return { ok: false, reason: "muted", reply: MUTED };
  }
  if (opts.rateLimit) {
    const allowed = checkRateLimit(
      opts.rateLimit.state,
      opts.userId,
      opts.rateLimit.config,
      opts.rateLimit.permLevel,
      opts.nowMs,
    );
    if (!allowed) {
      return { ok: false, reason: "rate_limited", reply: RATE_LIMITED };
    }
  }
  return { ok: true };
}

export { checkChannel, checkRole, checkUser, checkDiscordAction };
