/**
 * AUTONOMY-1/2 (#44) — Discord side of "ask, don't guess; ping, don't die
 * quietly". Formats a run's HumanAsk as a Discord post: the question for the
 * requester plus a mention of the configured owner (IDENTITY-1). No owner
 * configured ⇒ no ping (IDENTITY-3 empty ⇒ nobody); the question still posts.
 *
 * The question is model-written: it is SAFE-6 scrubbed, `@everyone` /
 * `@here` are defanged, and the post carries `mentionUserIds` so the live
 * gateway limits allowed mentions to the owner (plus the replied-to user).
 * Posts go only where the caller already posts (allowlisted channel reply or
 * schedule channel) — no DM path, no new channel (DISCORD-5 / DISCORD-8).
 */

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
  /** Only these users may be pinged by the post (the owner, when set). */
  mentionUserIds: string[];
  /** Final thinking-status line. */
  status: string;
  /** True for a stuck run (thinking status shows as failed). */
  failed: boolean;
  ownerPinged: boolean;
};

export type FormatAskReplyOpts = {
  ask: HumanAsk;
  owner: OwnerRecord | null | undefined;
  /** Extra context for a stuck run (e.g. the run summary). */
  context?: string;
  /** Leading line (e.g. which schedule this is). */
  prefix?: string;
  /** Include "Reply to this message to answer." (reply-tracked posts only). */
  replyHint?: boolean;
};

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
 * Discord post for a run that needs a human. The owner mention sits on the
 * first line so a length cut can never drop the ping.
 */
export function formatAskReply(opts: FormatAskReplyOpts): AskReply {
  const stuck = opts.ask.reason === "stuck";
  const owner = opts.owner?.discordId ? opts.owner : null;
  const headline = stuck
    ? "⚠️ I'm stuck and need a human."
    : "❓ I need your input before I can continue.";
  const ping = owner ? ` <@${owner.discordId}>` : "";
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
  return {
    content,
    mentionUserIds: owner ? [owner.discordId] : [],
    status: stuck ? "⚠️ Stuck — asked for help" : "❓ Needs your input",
    failed: stuck,
    ownerPinged: Boolean(owner),
  };
}
