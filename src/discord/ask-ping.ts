/**
 * AUTONOMY-1/2/4 (#44) — Discord side of "ask, don't guess; ping, don't die
 * quietly". Formats a run's HumanAsk as a Discord post: the question for the
 * requester, with a mention of the requester on clarify (AUTONOMY-4) or the
 * configured owner on stuck (AUTONOMY-2). No mention target ⇒ no ping
 * (IDENTITY-3 empty ⇒ nobody); the question still posts.
 *
 * The question is model-written: it is SAFE-6 scrubbed, `@everyone` /
 * `@here` are defanged, and the post carries `mentionUserIds` so the live
 * gateway limits allowed mentions to the intended user(s). Posts go only
 * where the caller already posts (allowlisted channel reply or schedule
 * channel) — no DM path, no new channel (DISCORD-5 / DISCORD-8).
 */

import { createHash } from "node:crypto";
import type { HumanAsk } from "../agent/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { scrubSecrets } from "../store/scrub.ts";

/** Discord hard limit is 2000; the gateway slices at 1900. */
export const ASK_REPLY_MAX = 1900;
/** Question chars shown in the post. */
export const ASK_REPLY_QUESTION_MAX = 1200;
/** Stuck-run context chars shown (e.g. the verify failure summary). */
export const ASK_REPLY_CONTEXT_MAX = 400;

export const ASK_REPLY_HINT = "Reply to this message to answer.";

/** Bridge log line when a run needs a human but nobody can be pinged. */
export const ASK_NO_OWNER_WARNING =
  "[discord] run needs a human but no owner is configured — owner ping skipped (AUTONOMY-2 / IDENTITY-3)";

export type AskReply = {
  content: string;
  /** Only these users may be pinged by the post (requester and/or owner). */
  mentionUserIds: string[];
  /** Final thinking-status line. */
  status: string;
  /** True for a stuck run (thinking status shows as failed). */
  failed: boolean;
  /** True when the configured owner is among mentionUserIds. */
  ownerPinged: boolean;
  /** True when anyone was mentioned. */
  pinged: boolean;
};

export type FormatAskReplyOpts = {
  ask: HumanAsk;
  owner: OwnerRecord | null | undefined;
  /**
   * Discord snowflake of the message author / schedule creator (AUTONOMY-4).
   * Clarify mentions this id; stuck prefers the owner.
   */
  requesterDiscordId?: string;
  /** Extra context for a stuck run (e.g. the run summary). */
  context?: string;
  /** Leading line (e.g. which schedule this is). */
  prefix?: string;
  /** Include "Reply to this message to answer." (reply-tracked posts only). */
  replyHint?: boolean;
};

/**
 * Stable digest of an ask (reason + scrubbed question) used to ping once per
 * schedule per question (AUTONOMY-2). Hex SHA-256 of the SAFE-6 scrubbed
 * text, so a stored key never derives from a raw secret.
 */
export function askPingKey(ask: HumanAsk): string {
  return createHash("sha256")
    .update(`${ask.reason}\n${scrubSecrets(ask.question).trim()}`)
    .digest("hex");
}

/** Break `@everyone` / `@here` so they never render as mass mentions. */
export function defangMassMentions(text: string): string {
  return text.replace(/@(everyone|here)\b/gi, "@​$1");
}

function clean(text: string, max: number): string {
  const t = defangMassMentions(scrubSecrets(text)).trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function quote(text: string): string {
  return text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

/**
 * Discord post for a run that needs a human. The mention sits on the
 * first line so a length cut can never drop the ping.
 *
 * AUTONOMY-4: clarify → requester; stuck → owner (requester===owner is fine).
 */
export function formatAskReply(opts: FormatAskReplyOpts): AskReply {
  const stuck = opts.ask.reason === "stuck";
  const ownerId = opts.owner?.discordId?.trim() || "";
  const requesterId = opts.requesterDiscordId?.trim() || "";

  // Clarify addresses the requester; stuck pings the owner (AUTONOMY-2/4).
  const pingId = stuck ? ownerId : requesterId;
  const mentionUserIds = pingId ? [pingId] : [];
  const ping = pingId ? ` <@${pingId}>` : "";

  const headline = stuck
    ? "⚠️ I'm stuck and need a human."
    : "❓ I need your input before I can continue.";
  const lines: string[] = [];
  if (opts.prefix?.trim()) lines.push(clean(opts.prefix, 300));
  lines.push(`${headline}${ping}`);
  lines.push(quote(clean(opts.ask.question, ASK_REPLY_QUESTION_MAX)));
  if (stuck && opts.context?.trim()) {
    lines.push(clean(opts.context, ASK_REPLY_CONTEXT_MAX));
  }
  if (opts.replyHint) lines.push(ASK_REPLY_HINT);
  let content = lines.join("\n");
  if (content.length > ASK_REPLY_MAX) {
    content = `${content.slice(0, ASK_REPLY_MAX - 1)}…`;
  }
  const ownerPinged = Boolean(ownerId && mentionUserIds.includes(ownerId));
  return {
    content,
    mentionUserIds,
    status: stuck ? "⚠️ Stuck — asked for help" : "❓ Needs your input",
    failed: stuck,
    ownerPinged,
    pinged: mentionUserIds.length > 0,
  };
}
