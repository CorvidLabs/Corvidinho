/**
 * Admin-shaped /mute /unmute (DISCORD-7).
 * Permission floor enforced in slash-dispatch via minPermission ADMIN.
 */

import { muteUser, unmuteUser } from "../permissions.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";

function targetUserId(interaction: SlashInteraction): string | null {
  const raw = interaction.options.user;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export async function handleMuteCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const target = targetUserId(interaction);
  if (!target) {
    await interaction.reply({
      content: "usage: /mute user:@someone",
      ephemeral: true,
    });
    return;
  }
  const set = ctx.mutedUsers ?? new Set<string>();
  muteUser(set, target);
  ctx.mutedUsers = set;
  await interaction.reply({
    content: `Muted <@${target}> from bot interactions.`,
    ephemeral: true,
  });
}

export async function handleUnmuteCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const target = targetUserId(interaction);
  if (!target) {
    await interaction.reply({
      content: "usage: /unmute user:@someone",
      ephemeral: true,
    });
    return;
  }
  const set = ctx.mutedUsers ?? new Set<string>();
  unmuteUser(set, target);
  ctx.mutedUsers = set;
  await interaction.reply({
    content: `Unmuted <@${target}>.`,
    ephemeral: true,
  });
}
