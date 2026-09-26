/**
 * /status — bridge metrics (DISCORD-4). Steal shape from corvid-agent info-commands.
 */

import type { SlashContext, SlashInteraction } from "../slash-types.ts";

/** Format seconds into a compact uptime string. */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export async function handleStatusCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const uptimeSec = Math.max(0, Math.floor((Date.now() - ctx.startedAt) / 1000));
  const sessions = ctx.store.list().length;
  const workActive =
    ctx.workStore.countByStatus("queued") + ctx.workStore.countByStatus("running");
  const workDone = ctx.workStore.countByStatus("completed");
  const workFailed = ctx.workStore.countByStatus("failed");

  const lines = [
    `**Corvidinho** v${ctx.version}`,
    `Uptime: ${formatUptime(uptimeSec)}`,
    `Protocol: ${ctx.protocolVersion}`,
    `Channels (allowlist): ${ctx.channelIds.length}`,
    `Active sessions: ${sessions}`,
    `Work: ${workActive} active · ${workDone} done · ${workFailed} failed`,
  ];

  await interaction.reply({
    content: lines.join("\n"),
    ephemeral: true,
  });
}
