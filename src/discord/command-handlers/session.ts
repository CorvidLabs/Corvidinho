import {
  PermissionLevel,
  resolvePermissionLevel,
} from "../permissions.ts";
/**
 * /session list|start (DISCORD-4). Thin steal from corvid-agent session-commands.
 * Optional project (SESSION-WORKTREE-4). No ProcessManager, no Discord thread product UI.
 */

import { enrichPromptWithIdentity } from "../identity-inject.ts";
import { ThinkingStatus } from "../thinking-status.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";
import { formatTaskPlumbing } from "../../agent/task-summary.ts";
import { loadLlmEnv } from "../../agent/execute.ts";
import { ASK_NO_OWNER_WARNING, formatAskReply } from "../ask-ping.ts";
import {
  askNeedsOwner,
  askPingOwner,
  replyWithOwnerNotice,
  slashOwnerNotice,
} from "../spend-post.ts";

function formatSessionLine(s: {
  id: string;
  channelId: string;
  userId: string;
  topic?: string;
  project?: string;
  lastActivityAt: number;
}): string {
  const ageSec = Math.max(0, Math.floor((Date.now() - s.lastActivityAt) / 1000));
  const topic = s.topic ? ` — ${s.topic.slice(0, 60)}` : "";
  const project = s.project ? ` · \`${s.project}\`` : "";
  return `• \`${s.id}\` <#${s.channelId}> <@${s.userId}>${topic}${project} (${ageSec}s ago)`;
}

export async function handleSessionList(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const sessions = ctx.store.list();
  if (sessions.length === 0) {
    await interaction.reply({
      content: "No active sessions.",
      ephemeral: true,
    });
    return;
  }
  const lines = sessions.slice(0, 20).map(formatSessionLine);
  const more =
    sessions.length > 20 ? `\n…and ${sessions.length - 20} more` : "";
  await interaction.reply({
    content: `Active sessions (${sessions.length}):\n${lines.join("\n")}${more}`,
    ephemeral: true,
  });
}

export async function handleSessionStart(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const topicRaw = interaction.options.topic;
  const topic = typeof topicRaw === "string" ? topicRaw.trim() : "";
  if (!topic) {
    await interaction.reply({
      content: "Please provide a topic.",
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
    topic,
    project,
  });
  const session = created.session;
  if (!created.ok) {
    const body = `Session \`${session.id}\` failed to isolate worktree: ${created.error}`;
    if (interaction.editReply) {
      await interaction.editReply({ content: body });
    } else {
      await interaction.reply({ content: body });
    }
    await ctx.store.endSession(session);
    return;
  }

  const llmModel = loadLlmEnv(process.env).model;
  const outbound = ctx.thinkingOutbound;
  const thinking = outbound
    ? new ThinkingStatus({
        outbound,
        channelId: interaction.channelId,
        sessionId: session.id,
        model: llmModel,
        debounceMs: ctx.thinkingDebounceMs,
        tickMs: ctx.thinkingTickMs,
      })
    : null;

  if (thinking) {
    await thinking.start({ description: `Session: ${topic.slice(0, 80)}` });
  }

  const idInject = enrichPromptWithIdentity(topic, {
    userId: interaction.userId,
    displayName: interaction.userDisplayName,
    username: interaction.userUsername,
    owner: ctx.owner,
  });
  const prompt = idInject.prompt;

  let result;
  try {
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
    // Busy while the agent runs: the soft-TTL purge must not park this
    // worktree mid-run (REQ-discord-204).
    result = await ctx.store.runActive(session, () =>
      ctx.agent.runChat({
        prompt,
        humanText: topic,
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
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "agent error";
    await thinking?.fail(`❌ ${msg}`, { model: llmModel });
    const body = `Session \`${session.id}\` failed: ${msg}`;
    if (interaction.editReply) {
      await interaction.editReply({ content: body });
    } else {
      await interaction.reply({ content: body });
    }
    return;
  }

  const plumbing = result.task
    ? formatTaskPlumbing({
        state: result.task.state,
        verified: result.task.verified,
        verifySkipped: result.task.verifySkipped,
        attempts: result.task.attempts,
        cancelled: result.task.cancelled,
      })
    : undefined;
  const thinkExtras = { plumbing, model: llmModel };
  // AUTONOMY-1/2 + SAFE-8: a run that stopped to ask (e.g. at the spend cap)
  // is not "Done"; the owner is pinged (once per cap episode).
  const askOwner = result.ask ? askPingOwner(result.ask, ctx.owner, ctx.spendAlerts) : null;
  // The reply addresses the requester on clarify (AUTONOMY-4); the owner is
  // pinged in a separate post (below) for stuck and spend-cap.
  const ask = result.ask
    ? formatAskReply({
        ask: result.ask,
        owner: null,
        requesterDiscordId: interaction.userId,
        context: result.summary,
      })
    : null;
  if (ask && result.ask) {
    await (ask.failed
      ? thinking?.fail(ask.status, thinkExtras)
      : thinking?.done(ask.status, thinkExtras));
    if (askNeedsOwner(result.ask) && !askOwner?.owner && !askOwner?.deduped) {
      console.warn(ASK_NO_OWNER_WARNING);
    }
  } else if (result.ok) {
    await thinking?.done("✅ Done", thinkExtras);
  } else {
    await thinking?.fail(`❌ exit ${result.exitCode}`, thinkExtras);
  }

  const summary = ask
    ? ask.content
    : result.ok
      ? result.summary.slice(0, 1500)
      : `failed (exit ${result.exitCode})`;
  const wt = session.worktreePath
    ? `\nWorktree: \`${session.worktreePath}\``
    : "";
  const body = `Session \`${session.id}\` started.\nTopic: ${topic.slice(0, 200)}${wt}\n\n${summary}`;

  // Owner ping for the ask + pending SAFE-8 80% warning, as a fresh post.
  const notice = slashOwnerNotice({
    owner: ctx.owner,
    outbox: ctx.spendAlerts,
    ask: result.ask,
    pingOwnerForAsk: Boolean(askOwner?.owner),
    spendWarning: result.spendWarning,
    label: `/session \`${session.id}\``,
  });
  await replyWithOwnerNotice({ interaction, body, notice, post: ctx.post });
}

export async function handleSessionCommand(
  ctx: SlashContext,
  interaction: SlashInteraction,
): Promise<void> {
  const sub = interaction.subcommand ?? "list";
  if (sub === "start") {
    await handleSessionStart(ctx, interaction);
    return;
  }
  if (sub === "list") {
    await handleSessionList(ctx, interaction);
    return;
  }
  await interaction.reply({
    content: `Unknown /session subcommand: ${sub}. Use list or start.`,
    ephemeral: true,
  });
}
