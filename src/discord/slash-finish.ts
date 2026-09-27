/**
 * DISCORD-ASK-7 — finish /session start and /work with one public message when
 * practical: collapse thinking into the final body and drop the deferred slash
 * reply, instead of ✅ Done embed + a second interaction reply.
 */

import type { ThinkingStatus } from "./thinking-status.ts";
import type { SlashInteraction } from "./slash-types.ts";
import type { PendingAsk } from "./ask-buttons.ts";
import type { SessionStore } from "./session-store.ts";
import type { SessionStub } from "./types.ts";

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
   * Message components the answer carries: the Choose button of a button ask
   * (DISCORD-ASK-1, REQ-discord-044). The collapsed edit and the fallback
   * reply both carry them.
   */
  components?: unknown[];
  /**
   * Called once the body is out (collapsed edit or fallback reply), before
   * the deferred reply is resolved — so a caller knows the answer went out
   * even when resolving the deferred reply then throws. `messageId` is the
   * answer message when known (the collapsed message, or the fallback reply
   * id the gateway resolved), e.g. to record a Choose stub's id.
   */
  onDelivered?: (mode: "collapsed" | "fallback", messageId?: string) => void;
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
        ...(opts.components ? { components: opts.components } : {}),
        ...(opts.mentionUserIds ? { mentionUserIds: opts.mentionUserIds } : {}),
        ...(opts.thinkExtras ? { extras: opts.thinkExtras } : {}),
        failed: opts.askStatus ? opts.askStatus.failed : !opts.ok,
      })
    : null;
  if (collapsed) {
    opts.trackBotMessage?.(collapsed.messageId, opts.sessionId);
    opts.onDelivered?.("collapsed", collapsed.messageId);
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
  const payload = {
    content: opts.body,
    ...(opts.components ? { components: opts.components } : {}),
  };
  let messageId: string | undefined;
  if (opts.interaction.editReply) {
    const sent = await opts.interaction.editReply(payload);
    // DISCORD-2: a reply to the fallback answer continues the session too.
    if (sent?.messageId) {
      messageId = sent.messageId;
      opts.trackBotMessage?.(sent.messageId, opts.sessionId);
    }
  } else {
    await opts.interaction.reply(payload);
  }
  opts.onDelivered?.("fallback", messageId);
  return "fallback";
}

/**
 * DISCORD-ASK-1 (REQ-discord-044): once a `/work` or `/session start` Choose
 * stub is out, record its message id on the session's pending ask, so a pick
 * resumes in that message (DISCORD-ASK-7), as on the chat path. Only while
 * that ask is still the pending one of a live session: a pick that already
 * took it, or a session ended meanwhile, is left alone (the write is an
 * upsert, so it would bring an ended session's row back). Best effort: a
 * failed write is logged and never keeps the deferred reply from resolving.
 */
export function recordSlashStub(
  store: Pick<SessionStore, "get" | "setPendingAsk">,
  session: SessionStub,
  pending: PendingAsk,
  messageId: string | undefined,
): void {
  if (!messageId || session.pendingAsk?.askId !== pending.askId) return;
  if (store.get(session.id) !== session) return;
  pending.stubMessageId = messageId;
  try {
    store.setPendingAsk(session, pending);
  } catch (err) {
    console.warn(`[discord] slash ask stub for ${session.id} not recorded:`, err);
  }
}
