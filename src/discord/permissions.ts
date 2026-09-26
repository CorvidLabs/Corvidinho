/**
 * DISCORD-5 — allowlisted channels only via existing allowlist helpers.
 */

import {
  checkChannel,
  checkDiscordAction,
  checkRole,
  checkUser,
} from "../allowlist/discord.ts";
import type { AllowlistConfig, GateResult } from "../allowlist/types.ts";
import { NOT_AUTHORIZED } from "./types.ts";

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

export { checkChannel, checkRole, checkUser, checkDiscordAction };
