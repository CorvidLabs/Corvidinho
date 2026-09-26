/**
 * Slash command dispatch map (DISCORD-4 / DISCORD-6).
 * Ancestor shape: COMMAND_HANDLERS Map + permission gate before handler.
 * Corvidinho thin: channel allowlist re-check, then mute + rate limit.
 */

import { handleAgentsCommand } from "./command-handlers/agents.ts";
import { handleSessionCommand } from "./command-handlers/session.ts";
import { handleStatusCommand } from "./command-handlers/status.ts";
import { handleWorkCommand } from "./command-handlers/work.ts";
import { gateChannel, gateRateOrMute } from "./permissions.ts";
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

const COMMAND_HANDLERS = new Map<string, CommandHandler>([
  ["session", handleSessionCommand],
  ["status", handleStatusCommand],
  ["agents", handleAgentsCommand],
  ["work", handleWorkCommand],
]);

export function knownSlashCommands(): string[] {
  return [...SLASH_COMMAND_NAMES];
}

/**
 * Dispatch a slash interaction. Re-checks channel allowlist, then mute/rate.
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

  const handler = COMMAND_HANDLERS.get(interaction.commandName);
  if (!handler) {
    await interaction.reply({
      content: `Unknown command: /${interaction.commandName}`,
      ephemeral: true,
    });
    return { ok: false, reason: "unknown_command" };
  }

  await handler(ctx, interaction);
  return { ok: true, handled: true };
}
