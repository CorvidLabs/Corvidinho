/**
 * DISCORD-ASK-7 — finish /session start and /work with one public message when
 * practical: collapse thinking into the final body and drop the deferred slash
 * reply, instead of ✅ Done embed + a second interaction reply.
 */

import type { ThinkingStatus } from "./thinking-status.ts";
import type { SlashInteraction } from "./slash-types.ts";

export type SlashFinishThinkingOpts = {
  thinking: ThinkingStatus | null;
  body: string;
  interaction: SlashInteraction;
  sessionId: string;
  trackBotMessage?: (messageId: string, sessionId: string) => void;
  thinkExtras?: { plumbing?: string; model?: string };
  /** When collapse is unavailable, mark thinking done vs fail. */
  ok: boolean;
  failStatus?: string;
};

/**
 * Prefer finalizeContent on the progress message; resolve the deferred slash
 * reply via deleteReply (or a thin ✓) so the channel has one answer.
 * Fallback: Done/fail embed + full editReply/reply body.
 */
export async function finishSlashWithThinking(
  opts: SlashFinishThinkingOpts,
): Promise<"collapsed" | "fallback"> {
  const collapsed = opts.thinking
    ? await opts.thinking.finalizeContent({ content: opts.body })
    : null;
  if (collapsed) {
    opts.trackBotMessage?.(collapsed.messageId, opts.sessionId);
    if (opts.interaction.deleteReply) {
      await opts.interaction.deleteReply();
    } else if (opts.interaction.editReply) {
      // Deferred reply must be resolved; keep it thin when delete is unavailable.
      await opts.interaction.editReply({ content: "✓" });
    }
    return "collapsed";
  }

  if (opts.thinking) {
    if (opts.ok) {
      await opts.thinking.done("✅ Done", opts.thinkExtras);
    } else {
      await opts.thinking.fail(
        opts.failStatus ?? "❌ Failed",
        opts.thinkExtras,
      );
    }
  }
  if (opts.interaction.editReply) {
    await opts.interaction.editReply({ content: opts.body });
  } else {
    await opts.interaction.reply({ content: opts.body });
  }
  return "fallback";
}
