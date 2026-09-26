/**
 * /agents — list local agent identity (DISCORD-4).
 * Corvidinho is a single-runner thin slice (no multi-agent DB).
 */

import type { SlashContext, SlashInteraction } from "../slash-types.ts";

export async function handleAgentsCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const lines = [
    "Available agents:",
    `• **corvidinho** (v${ctx.version}) — local Linux Bun/TS runner`,
  ];
  await interaction.reply({
    content: lines.join("\n"),
    ephemeral: true,
  });
}
