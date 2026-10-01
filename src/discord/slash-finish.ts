/**
 * DISCORD-ASK-7 — finish /session start and /work with one public message when
 * practical: collapse thinking into the final body and drop the deferred slash
 * reply, instead of ✅ Done embed + a second interaction reply.
 */

import { planAnswerParts, postAnswerParts } from "./rich-reply.ts";
import type { AnswerExtras, ThinkingStatus } from "./thinking-status.ts";
import type { SlashInteraction } from "./slash-types.ts";
import type { ChannelPost } from "./spend-post.ts";
import type { PendingAsk } from "./ask-buttons.ts";
import type { SessionStore } from "./session-store.ts";
import type { SessionStub } from "./types.ts";
import type { PublicReplyGate, PublicReplyOutcome } from "./public-reply-gate.ts";

export type SlashFinishThinkingOpts = {
  thinking: ThinkingStatus | null;
  body: string;
  interaction: SlashInteraction;
  sessionId: string;
  trackBotMessage?: (messageId: string, sessionId: string) => void;
  /**
   * Answer footer extras (DISCORD-3.a / DISCORD-15): model, plumbing, and
   * tokens + cost (`spend`) on the owner's own runs only.
   */
  thinkExtras?: AnswerExtras;
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
   * `components` is a free-text ask's Answer button, not a Choose stub
   * (DISCORD-ASK-4.a): the collapsed answer keeps its footer-only embed.
   */
  keepFooter?: boolean;
  /**
   * Called once the body is out (collapsed edit or fallback reply), before
   * the deferred reply is resolved — so a caller knows the answer went out
   * even when resolving the deferred reply then throws. `messageId` is the
   * answer message when known (the collapsed message, or the fallback reply
   * id the gateway resolved), e.g. to record a Choose stub's id.
   */
  onDelivered?: (mode: "collapsed" | "fallback", messageId?: string) => void;
  /**
   * Fresh channel post for the parts of a long fallback answer after the one
   * the deferred reply holds (DISCORD-16). Without it only the first part
   * goes out.
   */
  post?: ChannelPost;
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
        ...(opts.keepFooter ? { keepFooter: true } : {}),
        ...(opts.mentionUserIds ? { mentionUserIds: opts.mentionUserIds } : {}),
        ...(opts.thinkExtras ? { extras: opts.thinkExtras } : {}),
        failed: opts.askStatus ? opts.askStatus.failed : !opts.ok,
      })
    : null;
  if (collapsed) {
    // DISCORD-2: a reply to any part of the answer continues the session.
    for (const id of collapsed.messageIds) opts.trackBotMessage?.(id, opts.sessionId);
    // The Choose button rides the last part (a stub is one part).
    opts.onDelivered?.(
      "collapsed",
      opts.components?.length ? collapsed.messageIds.at(-1) : collapsed.messageId,
    );
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
  // DISCORD-15/16: the answer carries its footer (on the last part) and is
  // split at 2000 characters; the deferred reply holds the first part and
  // `post` sends the rest.
  const hasComponents = Boolean(opts.components?.length);
  // A Choose stub carries no footer; an Answer button keeps it (DISCORD-ASK-4.a).
  const footer =
    opts.thinking && (!hasComponents || opts.keepFooter)
      ? opts.thinking.answerFooter({
          extras: opts.thinkExtras,
          failed: opts.askStatus ? opts.askStatus.failed : !opts.ok,
        })
      : null;
  const parts = planAnswerParts(opts.body, {
    footer,
    allowEmbed: !hasComponents && !opts.mentionUserIds?.length,
  });
  const first = parts[0]!;
  const single = parts.length === 1 || !opts.post;
  const payload = {
    ...(first.content !== null ? { content: first.content } : {}),
    ...(first.embed ? { embeds: [first.embed] } : {}),
    ...(opts.components && single ? { components: opts.components } : {}),
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
  if (!single && opts.post) {
    const rest = await postAnswerParts(opts.post, {
      channelId: opts.interaction.channelId,
      content: opts.body,
      footer,
      mentionUserIds: opts.mentionUserIds,
      components: opts.components,
      ...(opts.keepFooter ? { keepFooter: true } : {}),
      skipFirst: true,
    });
    for (const id of rest ?? []) opts.trackBotMessage?.(id, opts.sessionId);
    if (hasComponents && rest?.length) messageId = rest.at(-1);
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

/**
 * AUTONOMY-10 / 10.a (REQ-discord-099): a `/session start` or `/work` answer
 * that carries model text (`modelText`: the run's answer or question; never
 * "⏹ Stopped", a failed run's line or a spend-cap stop) waits for the owner's
 * OK when the command's channel is a public thread and fewer than 20 replies
 * were approved. The hold line shows on the progress message (else on the
 * deferred reply, else in a short note) while the owner's `reply` card is
 * open; a stop of the run ends the wait. Without a gate, or for fixed text,
 * the body goes out as it is.
 */
export async function holdSlashReply(opts: {
  gate: PublicReplyGate | undefined;
  thinking: ThinkingStatus | null;
  interaction: SlashInteraction;
  body: string;
  modelText: boolean;
  surface: "session" | "work";
  signal?: AbortSignal;
}): Promise<PublicReplyOutcome> {
  if (!opts.gate || !opts.modelText) return { post: true, held: false, text: opts.body };
  const { interaction, thinking } = opts;
  return opts.gate.hold({
    channelId: interaction.channelId,
    text: opts.body,
    requester: interaction.userId,
    surface: opts.surface,
    ...(opts.signal ? { signal: opts.signal } : {}),
    showHold: async (line) => {
      if (thinking && (await thinking.hold(line))) return true;
      if (!interaction.editReply) return false;
      try {
        await interaction.editReply({ content: line });
        return true;
      } catch {
        return false;
      }
    },
  });
}
