/**
 * Discord allowlist stub for future HEAR (#5) — ALLOW-3,5 / DISCORD-5.
 * Default-deny: empty allow ⇒ refuse listen/post. Deny always wins.
 * No Discord bridge here — API only.
 */

import type { AllowlistConfig, DiscordAllowlists, GateResult } from "./types.ts";

function denied(kind: string, id: string): GateResult {
  return { ok: false, error: `not authorized: Discord ${kind} "${id}" is denied` };
}

function emptyDeny(kind: string): GateResult {
  return {
    ok: false,
    error: `not authorized: Discord ${kind} allowlist empty (default-deny; set allowlist file or CORVIDINHO_DISCORD_ALLOW_* env)`,
  };
}

function notListed(kind: string, id: string): GateResult {
  return { ok: false, error: `not authorized: Discord ${kind} "${id}" is not allowlisted` };
}

export function checkChannel(
  channelId: string | undefined,
  cfg: AllowlistConfig | DiscordAllowlists,
): GateResult {
  const d = "discord" in cfg ? cfg.discord : cfg;
  const id = (channelId ?? "").trim().toLowerCase();
  if (!id) return { ok: false, error: "not authorized: missing Discord channel" };
  if (d.denyChannels.some((x) => x.toLowerCase() === id)) return denied("channel", channelId!);
  if (d.channels.length === 0) return emptyDeny("channel");
  if (!d.channels.some((x) => x.toLowerCase() === id)) return notListed("channel", channelId!);
  return { ok: true };
}

export function checkRole(
  roleId: string | undefined,
  cfg: AllowlistConfig | DiscordAllowlists,
): GateResult {
  const d = "discord" in cfg ? cfg.discord : cfg;
  const id = (roleId ?? "").trim().toLowerCase();
  if (!id) return { ok: false, error: "not authorized: missing Discord role" };
  if (d.denyRoles.some((x) => x.toLowerCase() === id)) return denied("role", roleId!);
  if (d.roles.length === 0) return emptyDeny("role");
  if (!d.roles.some((x) => x.toLowerCase() === id)) return notListed("role", roleId!);
  return { ok: true };
}

export function checkUser(
  userId: string | undefined,
  cfg: AllowlistConfig | DiscordAllowlists,
): GateResult {
  const d = "discord" in cfg ? cfg.discord : cfg;
  const id = (userId ?? "").trim().toLowerCase();
  if (!id) return { ok: false, error: "not authorized: missing Discord user" };
  if (d.denyUsers.some((x) => x.toLowerCase() === id)) return denied("user", userId!);
  if (d.users.length === 0) return emptyDeny("user");
  if (!d.users.some((x) => x.toLowerCase() === id)) return notListed("user", userId!);
  return { ok: true };
}

/** True if the actor may post/listen: channel allowlisted AND (user OR any role) allowlisted when provided. */
export function checkDiscordAction(
  opts: {
    channelId?: string;
    userId?: string;
    roleIds?: string[];
  },
  cfg: AllowlistConfig,
): GateResult {
  const ch = checkChannel(opts.channelId, cfg);
  if (!ch.ok) return ch;
  // If neither user nor roles supplied, channel-only gate (listen path may only have channel).
  if (!opts.userId && (!opts.roleIds || opts.roleIds.length === 0)) {
    return { ok: true };
  }
  if (opts.userId) {
    const u = checkUser(opts.userId, cfg);
    if (u.ok) return { ok: true };
  }
  if (opts.roleIds) {
    for (const r of opts.roleIds) {
      const rr = checkRole(r, cfg);
      if (rr.ok) return { ok: true };
    }
  }
  return {
    ok: false,
    error: "not authorized: Discord user/role not allowlisted for this action",
  };
}
