import {
  PermissionLevel,
  resolvePermissionLevel,
} from "../permissions.ts";
/**
 * /work — drive a work task (DISCORD-4). Thin steal from corvid-agent
 * session-commands handleWorkCommand + work-dispatch (agent ops, not token product).
 * Optional project (SESSION-WORKTREE-4). In-memory WorkStore + AgentClient; no ProcessManager.
 */

import { ThinkingStatus } from "../thinking-status.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";
import { openWorkPr, type OpenWorkPrInput } from "../../work/pr.ts";
import { scrubSecrets } from "../../store/scrub.ts";

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

  const projectRaw = interaction.options.project;
  const project =
    typeof projectRaw === "string" && projectRaw.trim()
      ? projectRaw.trim()
      : undefined;

  await interaction.deferReply?.({ ephemeral: false });

  const created = await ctx.store.createWithWorktree({
    channelId: interaction.channelId,
    userId: interaction.userId,
    topic: description.slice(0, 120),
    project,
  });
  const session = created.session;
  if (!created.ok) {
    const body = `Work failed to isolate worktree: ${created.error}`;
    if (interaction.editReply) {
      await interaction.editReply({ content: body });
    } else {
      await interaction.reply({ content: body });
    }
    await ctx.store.endSession(session);
    return;
  }

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

  const actingIsAdmin =
    resolvePermissionLevel({
      userId: interaction.userId,
      roleIds: interaction.roleIds,
      allowlist: ctx.allowlist,
      adminUserIds: ctx.adminUserIds,
      adminRoleIds: ctx.adminRoleIds,
      owner: ctx.owner,
      mutedUsers: ctx.mutedUsers,
    }) >= PermissionLevel.ADMIN;
  let result;
  try {
    result = await ctx.agent.runChat({
      prompt: description,
      humanText: description,
      sessionId: session.id,
      resume: false,
      actingUserId: interaction.userId,
      actingIsAdmin,
      cwd: ctx.store.cwdFor(session),
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
  const wt = session.worktreePath
    ? `\nWorktree: \`${session.worktreePath}\``
    : "";
  // AUTONOMOUS-3 / GITHUB-2/5 (REQ-discord-088): ship a verified worktree as
  // a draft PR only when the PR path is allowlisted; else one plain line why.
  // ROLES-CHAT-3: commit/push/PR are mutating — only ADMIN (the owner) may
  // ship /work as a PR; everyone else keeps the changes on the work branch.
  const prLine = !actingIsAdmin
    ? "PR: not opened — only the owner (ADMIN) can ship /work as a PR (ROLES-CHAT-3). The changes stay on the work branch."
    : await shipWorkPr(ctx, {
    worktreePath:
      session.worktreeState === "active" ? session.worktreePath : undefined,
    branch: session.worktreeBranch,
    taskId: task.id,
    description,
    run: { ok: result.ok, exitCode: result.exitCode, task: result.task },
  });
  const body = [
    `Work task \`${task.id}\` (${task.status}).`,
    `Session: \`${session.id}\`${wt}`,
    `Description: ${description.slice(0, 200)}`,
    prLine,
    "",
    summary,
  ].join("\n");

  if (interaction.editReply) {
    await interaction.editReply({ content: body });
  } else {
    await interaction.reply({ content: body });
  }
}

/** One reply line for the /work PR step; never throws (REQ-discord-088). */
async function shipWorkPr(
  ctx: SlashContext,
  input: OpenWorkPrInput,
): Promise<string> {
  try {
    const pr = await (ctx.openWorkPr ?? openWorkPr)(input);
    return pr.line.slice(0, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return scrubSecrets(`PR: not opened — ${msg.slice(0, 200)}`);
  }
}
