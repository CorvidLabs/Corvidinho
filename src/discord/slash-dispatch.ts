/**
 * Slash command dispatch map (DISCORD-4 / 6 / 7 / DENY-1..3).
 * Ancestor shape: COMMAND_HANDLERS Map + permission gate before handler.
 * Corvidinho: channel allowlist → actor gate (REQ-discord-201) → mute/rate →
 * resolvePermissionLevel + minPermission re-check (DISCORD-7) → handler.
 *
 * Channel deny (DISCORD-DENY-1..3):
 * - ADMIN → ephemeral allowlist tip (no public leak)
 * - non-admin → ephemeral zero-width ack (Discord 3s rule; no useful leak)
 * Actor deny (deny-listed, or unlisted when a user/role allowlist applies) →
 * the same ephemeral zero-width ack on every command (REQ-discord-201).
 */

import { handleAgentsCommand } from "./command-handlers/agents.ts";
import { handleMuteCommand, handleUnmuteCommand } from "./command-handlers/mute.ts";
import { handleSessionCommand } from "./command-handlers/session.ts";
import { handleStatusCommand } from "./command-handlers/status.ts";
import { handleWorkCommand } from "./command-handlers/work.ts";
import { handleScheduleCommand } from "./command-handlers/schedule.ts";
import { handleAnnounceCommand } from "./command-handlers/announce.ts";
import { handleAdminCommand } from "./command-handlers/admin.ts";
import {
  gateActor,
  gateChannel,
  gateRateOrMute,
  PermissionLevel,
  resolvePermissionLevel,
} from "./permissions.ts";
import { SLASH_COMMAND_NAMES } from "./slash-commands.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashResult,
} from "./slash-types.ts";
import {
  ALLOWLIST_DENY_TIP,
  EPHEMERAL_SILENT_ACK,
  NOT_AUTHORIZED,
} from "./types.ts";

type CommandHandler = (
  ctx: SlashContext,
  interaction: SlashInteraction,
) => Promise<void>;

type CommandEntry = {
  handler: CommandHandler;
  /** Ancestor minPermission — re-checked at run time (DISCORD-7). */
  minPermission?: number;
};

const COMMAND_HANDLERS = new Map<string, CommandEntry>([
  ["session", { handler: handleSessionCommand }],
  ["status", { handler: handleStatusCommand }],
  ["agents", { handler: handleAgentsCommand }],
  ["work", { handler: handleWorkCommand }],
  // Mutations re-check ADMIN inside handler so list stays open (ancestor pattern).
  ["schedule", { handler: handleScheduleCommand }],
  // Mutations re-check ADMIN inside handler (DISCORD-ANNOUNCE-5).
  ["announce", { handler: handleAnnounceCommand }],
  [
    "mute",
    {
      handler: handleMuteCommand,
      minPermission: PermissionLevel.ADMIN,
    },
  ],
  [
    "unmute",
    {
      handler: handleUnmuteCommand,
      minPermission: PermissionLevel.ADMIN,
    },
  ],
  // ADMIN-1..4: floor here AND an explicit re-check inside the handler.
  [
    "admin",
    {
      handler: handleAdminCommand,
      minPermission: PermissionLevel.ADMIN,
    },
  ],
]);

export function knownSlashCommands(): string[] {
  return [...SLASH_COMMAND_NAMES];
}

function isAdminActor(ctx: SlashContext, interaction: SlashInteraction): boolean {
  const permLevel = resolvePermissionLevel({
    userId: interaction.userId,
    roleIds: interaction.roleIds,
    mutedUsers: ctx.mutedUsers,
    allowlist: ctx.allowlist,
    adminUserIds: ctx.adminUserIds,
    adminRoleIds: ctx.adminRoleIds,
    owner: ctx.owner,
  });
  return permLevel >= PermissionLevel.ADMIN;
}

/**
 * Dispatch a slash interaction.
 * Order: channel → actor → mute/rate → permission floor → handler.
 */
export async function handleSlashInteraction(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<SlashResult> {
  const gate = gateChannel(interaction.channelId, ctx.allowlist);
  if (!gate.ok) {
    const admin = isAdminActor(ctx, interaction);
    if (admin) {
      await interaction.reply({
        content: ALLOWLIST_DENY_TIP,
        ephemeral: true,
      });
      return {
        ok: false,
        reason: "channel_not_allowlisted",
        reply: ALLOWLIST_DENY_TIP,
      };
    }
    // DISCORD-DENY-3: Discord forces an interaction response within 3s.
    // Ephemeral zero-width ack — invoker-only, no useful leak.
    await interaction.reply({
      content: EPHEMERAL_SILENT_ACK,
      ephemeral: true,
    });
    return { ok: false, reason: "channel_not_allowlisted" };
  }

  // REQ-discord-201 / DISCORD-DENY-3 — every command gates the actor; the
  // owner is refused here only when deny-listed (user or role) and is then
  // not ADMIN, so no admin tip applies.
  const actorGate = gateActor({
    userId: interaction.userId,
    roleIds: interaction.roleIds,
    allowlist: ctx.allowlist,
    owner: ctx.owner,
  });
  if (!actorGate.ok) {
    await interaction.reply({
      content: EPHEMERAL_SILENT_ACK,
      ephemeral: true,
    });
    return { ok: false, reason: "user_not_allowlisted" };
  }

  const rateGate = gateRateOrMute({
    userId: interaction.userId,
    mutedUsers: ctx.mutedUsers,
    rateLimit:
      ctx.rateLimitState && ctx.rateLimitConfig
        ? {
            state: ctx.rateLimitState,
            config: ctx.rateLimitConfig,
            // REQ-discord-010 — rateLimitByLevel applies to the actor's level.
            permLevel:
              ctx.permLevelFor?.(interaction.userId) ??
              resolvePermissionLevel({
                userId: interaction.userId,
                roleIds: interaction.roleIds,
                allowlist: ctx.allowlist,
                owner: ctx.owner,
              }),
          }
        : undefined,
  });
  if (!rateGate.ok) {
    await interaction.reply({
      content: rateGate.reply,
      ephemeral: true,
    });
    return { ok: false, reason: rateGate.reason, reply: rateGate.reply };
  }

  const entry = COMMAND_HANDLERS.get(interaction.commandName);
  if (!entry) {
    await interaction.reply({
      content: `Unknown command: /${interaction.commandName}`,
      ephemeral: true,
    });
    return { ok: false, reason: "unknown_command" };
  }

  // DISCORD-7 — re-check minPermission at run time (never trust UI alone).
  if (entry.minPermission !== undefined) {
    const permLevel = resolvePermissionLevel({
      userId: interaction.userId,
      roleIds: interaction.roleIds,
      mutedUsers: ctx.mutedUsers,
      allowlist: ctx.allowlist,
      adminUserIds: ctx.adminUserIds,
      adminRoleIds: ctx.adminRoleIds,
      owner: ctx.owner,
    });
    if (permLevel < entry.minPermission) {
      await interaction.reply({
        content: NOT_AUTHORIZED,
        ephemeral: true,
      });
      return {
        ok: false,
        reason: "insufficient_permission",
        reply: NOT_AUTHORIZED,
      };
    }
  }

  await entry.handler(ctx, interaction);
  return { ok: true, handled: true };
}
