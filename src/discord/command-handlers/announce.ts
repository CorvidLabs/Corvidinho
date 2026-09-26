/**
 * /announce channel|show (DISCORD-ANNOUNCE-1..6).
 * Mutations ADMIN re-check at handler time; empty admin = deny-all.
 * Channel option is Discord CHANNEL picker (never type snowflake by hand).
 */

import {
  PermissionLevel,
  resolvePermissionLevel,
} from "../permissions.ts";
import { formatAnnounceChannelLine } from "../announce.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";
import { NOT_AUTHORIZED } from "../types.ts";

function requireAdmin(
  ctx: SlashContext,
  interaction: SlashInteraction,
): boolean {
  const level = resolvePermissionLevel({
    userId: interaction.userId,
    roleIds: interaction.roleIds,
    mutedUsers: ctx.mutedUsers,
    allowlist: ctx.allowlist,
    adminUserIds: ctx.adminUserIds,
    adminRoleIds: ctx.adminRoleIds,
  });
  return level >= PermissionLevel.ADMIN;
}

function optString(
  interaction: SlashInteraction,
  key: string,
): string | undefined {
  const v = interaction.options[key];
  return typeof v === "string" ? v.trim() : undefined;
}

function optBool(
  interaction: SlashInteraction,
  key: string,
): boolean | undefined {
  const v = interaction.options[key];
  return typeof v === "boolean" ? v : undefined;
}

export async function handleAnnounceCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const store = ctx.announceStore;
  if (!store) {
    await interaction.reply({
      content: "Announce store not available.",
      ephemeral: true,
    });
    return;
  }

  const sub = interaction.subcommand ?? "show";

  switch (sub) {
    case "show":
      await handleShow(ctx, interaction);
      return;
    case "channel":
      if (!requireAdmin(ctx, interaction)) {
        await interaction.reply({
          content: NOT_AUTHORIZED,
          ephemeral: true,
        });
        return;
      }
      await handleChannel(ctx, interaction);
      return;
    default:
      await interaction.reply({
        content: `Unknown subcommand: ${sub}`,
        ephemeral: true,
      });
  }
}

async function handleShow(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const id = ctx.announceStore!.getChannelId();
  await interaction.reply({
    content: formatAnnounceChannelLine(id),
    ephemeral: true,
  });
}

async function handleChannel(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const clear = optBool(interaction, "clear") === true;
  const channel = optString(interaction, "channel");

  if (clear) {
    ctx.announceStore!.clearChannelId();
    await interaction.reply({
      content:
        "Announcements channel cleared. No announce posts until `/announce channel` sets one again (default-deny).",
      ephemeral: true,
    });
    return;
  }

  if (!channel) {
    await interaction.reply({
      content:
        "Pick a channel from the dropdown (`channel` option), or set `clear:true` to unset. Do not type a snowflake by hand.",
      ephemeral: true,
    });
    return;
  }

  ctx.announceStore!.setChannelId(channel);
  await interaction.reply({
    content: [
      `Announcements channel set to <#${channel}>.`,
      "Version bumps / bridge restarts post **only** here — not to the dogfood chat allowlist.",
    ].join("\n"),
    ephemeral: true,
  });
}
