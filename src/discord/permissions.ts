/**
 * DISCORD-5 — allowlisted channels via existing allowlist helpers.
 * DISCORD-6 — per-user rate limits + mutes (thin steal from corvid-agent).
 * DISCORD-7 — resolvePermissionLevel + minPermission re-check at run time.
 * IDENTITY-1 / ADMIN-4 — configured owner resolves to ADMIN at handler time.
 */

import {
  checkChannel,
  checkDiscordAction,
  checkRole,
  checkUser,
} from "../allowlist/discord.ts";
import type { AllowlistConfig, GateResult } from "../allowlist/types.ts";
import { isOwnerDiscord, type OwnerRecord } from "../identity/owner.ts";
import { MUTED, NOT_AUTHORIZED, RATE_LIMITED } from "./types.ts";


/** Ancestor PermissionLevel (corvid-agent / Merlin). Higher = more power. */
export const PermissionLevel = {
  BLOCKED: 0,
  BASIC: 1,
  STANDARD: 2,
  ADMIN: 3,
} as const;
export type PermissionLevel =
  (typeof PermissionLevel)[keyof typeof PermissionLevel];

export type ResolvePermissionOpts = {
  userId: string;
  /** Member role snowflakes (optional). */
  roleIds?: string[];
  /** In-memory muted set (DISCORD-6). */
  mutedUsers?: Set<string>;
  allowlist: AllowlistConfig;
  /** DISCORD-7 — empty ⇒ nobody ADMIN (default-deny). */
  adminUserIds?: string[];
  adminRoleIds?: string[];
  /**
   * IDENTITY-1 — configured owner (matched by Discord snowflake only).
   * null/undefined ⇒ no owner; admin lists behave exactly as before.
   */
  owner?: OwnerRecord | null;
};

/**
 * Resolve caller permission at command run time (DISCORD-7).
 * Empty adminUserIds/adminRoleIds and no owner ⇒ nobody is ADMIN (default-deny).
 * The configured owner is ADMIN unless muted or deny-listed (ADMIN-4).
 * Denied users are BLOCKED. When users+roles allowlists are both empty,
 * channel-gated callers get STANDARD (preserve HEAR thin slash).
 */
export function resolvePermissionLevel(opts: ResolvePermissionOpts): PermissionLevel {
  const id = opts.userId.trim().toLowerCase();
  const d = opts.allowlist.discord;
  const adminUsers = (opts.adminUserIds ?? []).map((x) => x.toLowerCase());
  const adminRoles = (opts.adminRoleIds ?? []).map((x) => x.toLowerCase());
  if (opts.mutedUsers && opts.mutedUsers.has(opts.userId)) {
    return PermissionLevel.BLOCKED;
  }
  if (d.denyUsers.some((x) => x === id)) {
    return PermissionLevel.BLOCKED;
  }
  const roleIds = (opts.roleIds ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (isOwnerDiscord(opts.owner, opts.userId)) {
    return PermissionLevel.ADMIN;
  }
  if (adminUsers.includes(id)) {
    return PermissionLevel.ADMIN;
  }
  if (roleIds.some((r) => adminRoles.includes(r))) {
    return PermissionLevel.ADMIN;
  }
  if (d.users.some((x) => x === id)) {
    return PermissionLevel.STANDARD;
  }
  if (roleIds.some((r) => d.roles.includes(r))) {
    return PermissionLevel.STANDARD;
  }
  // Empty user+role allowlists: channel gate already applied → STANDARD
  if (d.users.length === 0 && d.roles.length === 0) {
    return PermissionLevel.STANDARD;
  }
  return PermissionLevel.BLOCKED;
}

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
