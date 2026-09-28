/**
 * Admin-shaped /mute /unmute (DISCORD-7).
 * Permission floor enforced in slash-dispatch via minPermission ADMIN.
 * DISCORD-6 / IDENTITY-2: /mute never targets the invoker or the configured
 * owner — a muted owner is not ADMIN, so /unmute would be refused until the
 * bridge restarts.
 */

import { isOwnerDiscord } from "../../identity/owner.ts";
import { muteUser, unmuteUser } from "../permissions.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";

/** Ephemeral refusal for /mute of yourself or the configured owner. */
export const MUTE_SELF_OR_OWNER_REFUSED =
  "You can't mute yourself or the owner — the owner would lose /unmute until the bridge restarts.";

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
  if (target === interaction.userId || isOwnerDiscord(ctx.owner, target)) {
    await interaction.reply({
      content: MUTE_SELF_OR_OWNER_REFUSED,
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
