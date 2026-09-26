import {
  PermissionLevel,
  resolvePermissionLevel,
} from "../permissions.ts";
/**
 * /work — drive a work task (DISCORD-4). Thin steal from corvid-agent
 * session-commands handleWorkCommand + work-dispatch (agent ops, not token product).
 * In-memory WorkStore + AgentClient; no ProcessManager.
 */

import { ThinkingStatus } from "../thinking-status.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";

export async function handleWorkCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const descRaw = interaction.options.description;
  const description = typeof descRaw === "string" ? descRaw.trim() : "";
  if (!description) {
    await interaction.reply({
      content: "Please provide a task description.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply?.({ ephemeral: false });

  const session = ctx.store.create({
    channelId: interaction.channelId,
    userId: interaction.userId,
    topic: description.slice(0, 120),
  });

  const task = ctx.workStore.create({
    description,
    userId: interaction.userId,
    channelId: interaction.channelId,
    sessionId: session.id,
  });
  ctx.workStore.setStatus(task, "running");

  const outbound = ctx.thinkingOutbound;
  const thinking = outbound
    ? new ThinkingStatus({
        outbound,
        channelId: interaction.channelId,
        sessionId: session.id,
        debounceMs: ctx.thinkingDebounceMs,
        tickMs: ctx.thinkingTickMs,
      })
    : null;

  if (thinking) {
    await thinking.start({
      description: `Work: ${description.slice(0, 80)}`,
    });
  }

  let result;
  try {
    const actingIsAdmin =
      resolvePermissionLevel({
        userId: interaction.userId,
        roleIds: interaction.roleIds,
        allowlist: ctx.allowlist,
        adminUserIds: ctx.adminUserIds,
        adminRoleIds: ctx.adminRoleIds,
        mutedUsers: ctx.mutedUsers,
      }) >= PermissionLevel.ADMIN;
    result = await ctx.agent.runChat({
      prompt: description,
      sessionId: session.id,
      resume: false,
      actingUserId: interaction.userId,
      actingIsAdmin,
      onStatus: (u) => {
        void thinking?.update({
          tool: u.tool,
          tokens: u.tokens,
          description: u.message ? `⏳ ${u.message}` : undefined,
        });
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "agent error";
    ctx.workStore.setStatus(task, "failed", msg);
    await thinking?.fail(`❌ ${msg}`);
    const body = `Work \`${task.id}\` failed: ${msg}`;
    if (interaction.editReply) {
      await interaction.editReply({ content: body });
    } else {
      await interaction.reply({ content: body });
    }
    return;
  }

  if (result.ok) {
    ctx.workStore.setStatus(task, "completed", result.summary.slice(0, 500));
    await thinking?.done("✅ Done");
  } else {
    ctx.workStore.setStatus(
      task,
      "failed",
      `exit ${result.exitCode}`,
    );
    await thinking?.fail(`❌ exit ${result.exitCode}`);
  }

  const summary = result.ok
    ? result.summary.slice(0, 1500)
    : `failed (exit ${result.exitCode})`;
  const body = [
    `Work task \`${task.id}\` (${task.status}).`,
    `Session: \`${session.id}\``,
    `Description: ${description.slice(0, 200)}`,
    "",
    summary,
  ].join("\n");

  if (interaction.editReply) {
    await interaction.editReply({ content: body });
  } else {
    await interaction.reply({ content: body });
  }
}
