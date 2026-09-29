/**
 * DISCORD-5 — allowlisted channels via existing allowlist helpers.
 * DISCORD-6 — per-user rate limits + mutes (thin steal from corvid-agent).
 * DISCORD-7 — resolvePermissionLevel + minPermission re-check at run time.
 * IDENTITY-1 / ADMIN-4 — configured owner resolves to ADMIN at handler time.
 * IDENTITY-8..12 — resolveDiscordActingRole: owner / team / community for a
 * Discord run's spawn (the tool layer re-resolves it on every call).
 */

import {
  checkChannel,
  checkDiscordAction,
  checkRole,
  checkUser,
  isChannelDenied,
} from "../allowlist/discord.ts";
import type { AllowlistConfig, GateResult } from "../allowlist/types.ts";
import { isOwnerDiscord, type OwnerRecord } from "../identity/owner.ts";
import {
  resolvePerson,
  roleOfPerson,
  type PeopleDirectory,
  type PersonRole,
} from "../identity/people.ts";
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
  /**
   * Legacy admin allowlists. IGNORED for authorization: ADMIN is owner-only
   * (IDENTITY-2, Leif decision on #42). Kept so callers/config still compile;
   * the bridge warns at start when they are set.
   */
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
 * ADMIN is owner-only (IDENTITY-2): only the configured owner, unless muted
 * or deny-listed (ADMIN-4). No owner ⇒ nobody is ADMIN (IDENTITY-3).
 * Admin user/role lists no longer grant ADMIN.
 * Denied users are BLOCKED. When users+roles allowlists are both empty,
 * channel-gated callers get STANDARD (preserve HEAR thin slash).
 */
export function resolvePermissionLevel(opts: ResolvePermissionOpts): PermissionLevel {
  const id = opts.userId.trim().toLowerCase();
  const d = opts.allowlist.discord;
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

/**
 * IDENTITY-8..12 — the role a Discord run (chat, slash, button pick) is
 * spawned with: owner when the caller resolves to ADMIN (unchanged, owner
 * only); else team when the owner's people list, matched on the caller's
 * Discord user id (IDENTITY-7), declares them team; else community — the
 * undeclared, declared community, and a blocked (deny-listed / muted)
 * caller. This only caps the run: the tool layer re-resolves the role from
 * the live config and people list on every call (`resolveActingRole`).
 */
export function resolveDiscordActingRole(
  opts: ResolvePermissionOpts & { people?: PeopleDirectory | null },
): PersonRole {
  const level = resolvePermissionLevel(opts);
  if (level >= PermissionLevel.ADMIN) return "owner";
  if (level === PermissionLevel.BLOCKED) return "community";
  const person = resolvePerson(opts.people, { discordId: opts.userId });
  return roleOfPerson(person) === "team" ? "team" : "community";
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
  /**
   * DISCORD-6 — when each user last got a public MessageCreate refusal
   * notice (MUTED / RATE_LIMITED). Created on first use; see
   * `claimRefusalNotice`.
   */
  refusalNoticeAt?: Map<string, number>;
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

/**
 * DISCORD-5 / DISCORD-2.a / REQ-discord-212 — a conversation channel (a
 * thread with its parent, or a plain channel) is monitored when it or the
 * parent is allowlisted and neither is on `deny_channels`: deny always wins
 * over an allowlisted parent or thread (REQ-plugins-005).
 */
export function isMonitoredConversation(
  channelId: string,
  parentChannelId: string | null | undefined,
  cfg: AllowlistConfig,
): boolean {
  if (isChannelDenied(channelId, cfg) || isChannelDenied(parentChannelId, cfg)) {
    return false;
  }
  return (
    isMonitoredChannel(channelId, cfg) ||
    (!!parentChannelId && isMonitoredChannel(parentChannelId, cfg))
  );
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
 * Actor gate for every inbound chat message and slash command
 * (REQ-discord-201; ALLOW-3 / ALLOW-5 / DISCORD-5 / ROLES-CHAT-1).
 * Run after the channel gate. Deny lists always win: a deny-listed user or
 * any deny-listed role is refused. Otherwise the actor passes unless
 * resolvePermissionLevel says BLOCKED — i.e. when the user or role allowlist
 * is non-empty the actor must be listed, hold a listed role, or be the
 * configured owner; empty user+role lists leave the channel gate alone.
 * Mute is not checked here: it keeps its own MUTED reply (DISCORD-6).
 */
export function gateActor(opts: {
  userId: string;
  roleIds?: string[];
  allowlist: AllowlistConfig;
  owner?: OwnerRecord | null;
}): GateResult {
  const denyRoles = opts.allowlist.discord.denyRoles.map((r) => r.trim().toLowerCase());
  const roleIds = (opts.roleIds ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (roleIds.some((r) => denyRoles.includes(r))) {
    return { ok: false, error: "not authorized: Discord role is denied" };
  }
  const level = resolvePermissionLevel({
    userId: opts.userId,
    roleIds: opts.roleIds,
    allowlist: opts.allowlist,
    owner: opts.owner,
  });
  if (level === PermissionLevel.BLOCKED) {
    return {
      ok: false,
      error: "not authorized: Discord user/role not allowlisted for this action",
    };
  }
  return { ok: true };
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

/**
 * DISCORD-6 — MessageCreate has no ephemeral, so a muted or rate-limited
 * user gets at most one public refusal notice per rate-limit window; a
 * spammer cannot make the bot post once per spam message. Returns true (and
 * records `nowMs`) when this refusal may post its notice; false when the user
 * already got one less than `windowMs` ago. Expired entries are dropped.
 * Slash refusals do not use this: they stay ephemeral on every call.
 */
export function claimRefusalNotice(
  state: RateLimitState,
  userId: string,
  windowMs: number,
  nowMs: number = Date.now(),
): boolean {
  const notices = (state.refusalNoticeAt ??= new Map<string, number>());
  const last = notices.get(userId);
  if (last !== undefined && nowMs - last < windowMs) return false;
  for (const [id, at] of notices) {
    if (nowMs - at >= windowMs) notices.delete(id);
  }
  notices.set(userId, nowMs);
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
