/**
 * /session list|start (DISCORD-4). Thin steal from corvid-agent session-commands.
 * No ProcessManager, no Discord thread product UI.
 */

import { ThinkingStatus } from "../thinking-status.ts";
import type { SlashContext, SlashInteraction } from "../slash-types.ts";

function formatSessionLine(s: {
  id: string;
  channelId: string;
  userId: string;
  topic?: string;
  lastActivityAt: number;
}): string {
  const ageSec = Math.max(0, Math.floor((Date.now() - s.lastActivityAt) / 1000));
  const topic = s.topic ? ` — ${s.topic.slice(0, 60)}` : "";
  return `• \`${s.id}\` <#${s.channelId}> <@${s.userId}>${topic} (${ageSec}s ago)`;
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

  await interaction.deferReply?.({ ephemeral: false });

  const session = ctx.store.create({
    channelId: interaction.channelId,
    userId: interaction.userId,
    topic,
  });

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
    await thinking.start({ description: `Session: ${topic.slice(0, 80)}` });
  }

  let result;
  try {
    result = await ctx.agent.runChat({
      prompt: topic,
      sessionId: session.id,
      resume: false,
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
    await thinking?.fail(`❌ ${msg}`);
    const body = `Session \`${session.id}\` failed: ${msg}`;
    if (interaction.editReply) {
      await interaction.editReply({ content: body });
    } else {
      await interaction.reply({ content: body });
    }
    return;
  }

  if (result.ok) {
    await thinking?.done("✅ Done");
  } else {
    await thinking?.fail(`❌ exit ${result.exitCode}`);
  }

  const summary = result.ok
    ? result.summary.slice(0, 1500)
    : `failed (exit ${result.exitCode})`;
  const body = `Session \`${session.id}\` started.\nTopic: ${topic.slice(0, 200)}\n\n${summary}`;

  if (interaction.editReply) {
    await interaction.editReply({ content: body });
  } else {
    await interaction.reply({ content: body });
  }
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
