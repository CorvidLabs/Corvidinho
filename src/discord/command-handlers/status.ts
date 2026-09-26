/**
 * /status — bridge metrics (DISCORD-4) + dogfood polish lines.
 * Steal shape from corvid-agent info-commands; keep ephemeral.
 */

import { formatLlmStatusLine } from "../../version.ts";
import { formatAnnounceChannelLine } from "../announce.ts";
import { SLASH_COMMAND_NAMES } from "../slash-commands.ts";
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

export type StatusReportInput = {
  version: string;
  protocolVersion: number;
  startedAt: number;
  now?: number;
  channelCount: number;
  sessions: number;
  workActive: number;
  workDone: number;
  workFailed: number;
  /** Env for LLM line (tests inject). */
  env?: NodeJS.ProcessEnv;
  /** Optional precomputed LLM line (tests). */
  llmLine?: string;
  /** Optional git tip short SHA. */
  gitTipSha?: string;
  /** Slash names to list (defaults to registered set). */
  slashNames?: readonly string[];
  /** DISCORD-ANNOUNCE-3 — surface current announcements channel. */
  announceChannelId?: string | null;
};

/** Pure formatter for `/status` body — fixture-friendly. */
export function formatStatusReport(input: StatusReportInput): string {
  const now = input.now ?? Date.now();
  const uptimeSec = Math.max(0, Math.floor((now - input.startedAt) / 1000));
  const llmLine = input.llmLine ?? formatLlmStatusLine(input.env ?? process.env);
  const names = input.slashNames ?? SLASH_COMMAND_NAMES;
  const lines = [
    `**Corvidinho** v${input.version}`,
    `Uptime: ${formatUptime(uptimeSec)}`,
    `Protocol: ${input.protocolVersion}`,
    `Channels (allowlist): ${input.channelCount}`,
    `Active sessions: ${input.sessions}`,
    `Work: ${input.workActive} active · ${input.workDone} done · ${input.workFailed} failed`,
    llmLine,
    `Slash commands: ${names.join(", ")}`,
    formatAnnounceChannelLine(input.announceChannelId),
  ];
  if (input.gitTipSha) {
    lines.push(`Git tip: ${input.gitTipSha}`);
  }
  return lines.join("\n");
}

export async function handleStatusCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const sessions = ctx.store.list().length;
  const workActive =
    ctx.workStore.countByStatus("queued") + ctx.workStore.countByStatus("running");
  const workDone = ctx.workStore.countByStatus("completed");
  const workFailed = ctx.workStore.countByStatus("failed");

  const content = formatStatusReport({
    version: ctx.version,
    protocolVersion: ctx.protocolVersion,
    startedAt: ctx.startedAt,
    channelCount: ctx.channelIds.length,
    sessions,
    workActive,
    workDone,
    workFailed,
    env: ctx.env,
    gitTipSha: ctx.gitTipSha,
    announceChannelId: ctx.announceStore?.getChannelId() ?? null,
  });

  await interaction.reply({
    content,
    ephemeral: true,
  });
}
