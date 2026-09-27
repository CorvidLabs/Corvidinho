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
  /**
   * The run stopped to ask a human (AUTONOMY-1/2, SAFE-8 spend cap): when
   * collapse is unavailable the status shows this (never "✅ Done"); a
   * `failed` ask (stuck) shows as a failure.
   */
  askStatus?: { status: string; failed: boolean };
  /** Users the collapsed answer may mention (allowed mentions). */
  mentionUserIds?: string[];
  /**
   * Called once the body is out (collapsed edit or fallback reply), before
   * the deferred reply is resolved — so a caller knows the answer went out
   * even when resolving the deferred reply then throws.
   */
  onDelivered?: (mode: "collapsed" | "fallback") => void;
};

/**
 * Prefer finalizeContent on the progress message (keeping a footer-only
 * embed with `thinkExtras`, DISCORD-3.a); resolve the deferred slash reply via
 * deleteReply (or a thin ✓) so the channel has one answer.
 * Fallback: Done/fail (or ask) embed + full editReply/reply body.
 */
export async function finishSlashWithThinking(
  opts: SlashFinishThinkingOpts,
): Promise<"collapsed" | "fallback"> {
  // DISCORD-3.a — the collapsed answer keeps a footer-only embed (model +
  // plumbing), failed exactly when the fallback status below would be.
  const collapsed = opts.thinking
    ? await opts.thinking.finalizeContent({
        content: opts.body,
        ...(opts.mentionUserIds ? { mentionUserIds: opts.mentionUserIds } : {}),
        ...(opts.thinkExtras ? { extras: opts.thinkExtras } : {}),
        failed: opts.askStatus ? opts.askStatus.failed : !opts.ok,
      })
    : null;
  if (collapsed) {
    opts.trackBotMessage?.(collapsed.messageId, opts.sessionId);
    opts.onDelivered?.("collapsed");
    if (opts.interaction.deleteReply) {
      await opts.interaction.deleteReply();
    } else if (opts.interaction.editReply) {
      // Deferred reply must be resolved; keep it thin when delete is unavailable.
      await opts.interaction.editReply({ content: "✓" });
    }
    return "collapsed";
  }

  if (opts.thinking) {
    if (opts.askStatus) {
      await (opts.askStatus.failed
        ? opts.thinking.fail(opts.askStatus.status, opts.thinkExtras)
        : opts.thinking.done(opts.askStatus.status, opts.thinkExtras));
    } else if (opts.ok) {
      await opts.thinking.done("✅ Done", opts.thinkExtras);
    } else {
      await opts.thinking.fail(
        opts.failStatus ?? "❌ Failed",
        opts.thinkExtras,
      );
    }
  }
  if (opts.interaction.editReply) {
    const sent = await opts.interaction.editReply({ content: opts.body });
    // DISCORD-2: a reply to the fallback answer continues the session too.
    if (sent?.messageId) opts.trackBotMessage?.(sent.messageId, opts.sessionId);
  } else {
    await opts.interaction.reply({ content: opts.body });
  }
  opts.onDelivered?.("fallback");
  return "fallback";
}
