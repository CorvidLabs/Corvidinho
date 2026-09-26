/**
 * Slash command dispatch map (DISCORD-4 / 6 / 7).
 * Ancestor shape: COMMAND_HANDLERS Map + permission gate before handler.
 * Corvidinho: channel allowlist → mute/rate → resolvePermissionLevel +
 * minPermission re-check (DISCORD-7) → handler.
 */

import { handleAgentsCommand } from "./command-handlers/agents.ts";
import { handleMuteCommand, handleUnmuteCommand } from "./command-handlers/mute.ts";
import { handleSessionCommand } from "./command-handlers/session.ts";
import { handleStatusCommand } from "./command-handlers/status.ts";
import { handleWorkCommand } from "./command-handlers/work.ts";
import {
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
import { NOT_AUTHORIZED } from "./types.ts";

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
]);

export function knownSlashCommands(): string[] {
  return [...SLASH_COMMAND_NAMES];
}

/**
 * Dispatch a slash interaction.
 * Order: channel → mute/rate → permission floor → handler.
 */
export async function handleSlashInteraction(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<SlashResult> {
  const gate = gateChannel(interaction.channelId, ctx.allowlist);
  if (!gate.ok) {
    await interaction.reply({
      content: NOT_AUTHORIZED,
      ephemeral: true,
    });
    return { ok: false, reason: "channel_not_allowlisted", reply: NOT_AUTHORIZED };
  }

  const rateGate = gateRateOrMute({
    userId: interaction.userId,
    mutedUsers: ctx.mutedUsers,
    rateLimit:
      ctx.rateLimitState && ctx.rateLimitConfig
        ? {
            state: ctx.rateLimitState,
            config: ctx.rateLimitConfig,
            permLevel: ctx.permLevelFor?.(interaction.userId),
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
