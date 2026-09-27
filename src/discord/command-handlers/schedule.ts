/**
 * /schedule list|create|pause|resume|delete (DISCORD-SCHEDULE-1..5).
 * Steal from corvid-agent schedule-commands.ts — single-project first;
 * skip templates/pipelines/flock/council. Mutations ADMIN re-check at
 * handler time (DISCORD-7 / ADMIN-4); empty admin = deny-all.
 */

import { checkChannel } from "../../allowlist/discord.ts";
import {
  CadenceError,
  validateAndResolveCadence,
} from "../../scheduler/cron.ts";
import { resolveProjectDir } from "../../worktree/index.ts";
import {
  PermissionLevel,
  resolvePermissionLevel,
} from "../permissions.ts";
import { projectLabel } from "../list-scope.ts";
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
    owner: ctx.owner,
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

function formatScheduleLine(s: {
  id: string;
  name: string;
  status: string;
  cronExpression: string;
  project: string;
  nextRunAt?: number;
  lastRunAt?: number;
  executionCount: number;
}, opts: { fullProjectPath: boolean }): string {
  const status = s.status === "active" ? "🟢" : "🔴";
  const next = s.nextRunAt
    ? `<t:${Math.floor(s.nextRunAt / 1000)}:R>`
    : "not scheduled";
  const last = s.lastRunAt
    ? `<t:${Math.floor(s.lastRunAt / 1000)}:R>`
    : "never";
  // REQ-discord-418: only ADMIN sees an absolute host path.
  const project = opts.fullProjectPath
    ? s.project
    : (projectLabel(s.project) ?? "");
  return `${status} **${s.name}** (\`${s.id.slice(0, 12)}\`)\n  Project: \`${project}\` · Cron: \`${s.cronExpression}\` · Next: ${next} · Last: ${last} · Runs: ${s.executionCount}`;
}

export async function handleScheduleCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const store = ctx.scheduleStore;
  if (!store) {
    await interaction.reply({
      content: "Schedule store not available.",
      ephemeral: true,
    });
    return;
  }

  const sub = interaction.subcommand ?? "list";

  switch (sub) {
    case "list":
      await handleList(ctx, interaction);
      return;
    case "create":
    case "pause":
    case "resume":
    case "delete":
      if (!requireAdmin(ctx, interaction)) {
        await interaction.reply({
          content: NOT_AUTHORIZED,
          ephemeral: true,
        });
        return;
      }
      if (sub === "create") await handleCreate(ctx, interaction);
      else if (sub === "pause") await handlePause(ctx, interaction);
      else if (sub === "resume") await handleResume(ctx, interaction);
      else await handleDelete(ctx, interaction);
      return;
    default:
      await interaction.reply({
        content: `Unknown subcommand: ${sub}`,
        ephemeral: true,
      });
  }
}

async function handleList(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const schedules = ctx.scheduleStore!.list();
  if (schedules.length === 0) {
    await interaction.reply({
      content:
        "No schedules configured. Use `/schedule create` (admin) to add one.",
      ephemeral: true,
    });
    return;
  }
  const fullProjectPath = requireAdmin(ctx, interaction);
  const lines = schedules
    .slice(0, 15)
    .map((s) => formatScheduleLine(s, { fullProjectPath }));
  const more =
    schedules.length > 15 ? `\n…and ${schedules.length - 15} more` : "";
  await interaction.reply({
    content: `Schedules (${schedules.length}):\n\n${lines.join("\n\n")}${more}`,
    ephemeral: true,
  });
}

async function handleCreate(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const name = optString(interaction, "name");
  const cadence = optString(interaction, "cadence");
  const project = optString(interaction, "project");
  const prompt = optString(interaction, "prompt");
  const channel = optString(interaction, "channel");

  if (!name || !cadence || !project || !prompt) {
    await interaction.reply({
      content:
        "Required: `name`, `cadence`, `project`, and `prompt`. Example cadence: `every hour`, `@daily`, or `0 */6 * * *`.",
      ephemeral: true,
    });
    return;
  }

  if (channel) {
    const gate = checkChannel(channel, ctx.allowlist);
    if (!gate.ok) {
      await interaction.reply({
        content: `Channel \`${channel}\` is not allowlisted. Add it to discord.channels before scheduling posts there.`,
        ephemeral: true,
      });
      return;
    }
  }

  let cronExpression: string;
  try {
    cronExpression = validateAndResolveCadence(cadence);
  } catch (err) {
    const msg =
      err instanceof CadenceError ? err.message : "Invalid cadence.";
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  // REQ-discord-202 (DISCORD-SCHEDULE-3): the project must be one the ticks
  // may run on — bridge root or an allowlisted sibling checkout.
  const scoped = resolveProjectDir(project, {
    defaultProjectRoot: ctx.store.defaultProjectRoot ?? process.cwd(),
    github: ctx.allowlist.github,
  });
  if (!scoped.ok) {
    await interaction.reply({
      content: `Project refused: ${scoped.error}`,
      ephemeral: true,
    });
    return;
  }

  const schedule = ctx.scheduleStore!.create({
    name,
    cronExpression,
    project,
    prompt,
    channelId: channel,
    createdByUserId: interaction.userId,
    description: `Created via Discord /schedule create`,
  });

  await interaction.reply({
    content: [
      `Schedule created: **${schedule.name}** (\`${schedule.id}\`)`,
      `Cadence: \`${cadence}\` → \`${cronExpression}\``,
      `Project: \`${project}\``,
      channel ? `Channel: <#${channel}>` : "Channel: (none — runs silently)",
      `Next run: ${
        schedule.nextRunAt
          ? `<t:${Math.floor(schedule.nextRunAt / 1000)}:R>`
          : "pending"
      }`,
    ].join("\n"),
    ephemeral: true,
  });
}

async function handlePause(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const id = optString(interaction, "schedule");
  if (!id) {
    await interaction.reply({
      content: "Provide a schedule id (`/schedule list`).",
      ephemeral: true,
    });
    return;
  }
  const schedule = ctx.scheduleStore!.resolve(id);
  if (!schedule) {
    await interaction.reply({
      content: `Schedule not found: \`${id}\``,
      ephemeral: true,
    });
    return;
  }
  if (schedule.status === "paused") {
    await interaction.reply({
      content: `Schedule **${schedule.name}** is already paused.`,
      ephemeral: true,
    });
    return;
  }
  ctx.scheduleStore!.setStatus(schedule.id, "paused");
  await interaction.reply({
    content: `Paused **${schedule.name}** (\`${schedule.id}\`).`,
    ephemeral: true,
  });
}

async function handleResume(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const id = optString(interaction, "schedule");
  if (!id) {
    await interaction.reply({
      content: "Provide a schedule id (`/schedule list`).",
      ephemeral: true,
    });
    return;
  }
  const schedule = ctx.scheduleStore!.resolve(id);
  if (!schedule) {
    await interaction.reply({
      content: `Schedule not found: \`${id}\``,
      ephemeral: true,
    });
    return;
  }
  if (schedule.status === "active") {
    await interaction.reply({
      content: `Schedule **${schedule.name}** is already active.`,
      ephemeral: true,
    });
    return;
  }
  const updated = ctx.scheduleStore!.setStatus(schedule.id, "active");
  await interaction.reply({
    content: `Resumed **${schedule.name}** (\`${schedule.id}\`). Next: ${
      updated?.nextRunAt
        ? `<t:${Math.floor(updated.nextRunAt / 1000)}:R>`
        : "pending"
    }`,
    ephemeral: true,
  });
}

async function handleDelete(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const id = optString(interaction, "schedule");
  if (!id) {
    await interaction.reply({
      content: "Provide a schedule id (`/schedule list`).",
      ephemeral: true,
    });
    return;
  }
  const schedule = ctx.scheduleStore!.resolve(id);
  if (!schedule) {
    await interaction.reply({
      content: `Schedule not found: \`${id}\``,
      ephemeral: true,
    });
    return;
  }
  ctx.scheduleStore!.delete(schedule.id);
  await interaction.reply({
    content: `Deleted **${schedule.name}** (\`${schedule.id}\`).`,
    ephemeral: true,
  });
}
