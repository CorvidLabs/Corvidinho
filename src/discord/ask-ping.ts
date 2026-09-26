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

import { createHash } from "node:crypto";
import { formatSpendWarningLine } from "../agent/spend-notice.ts";
import type { HumanAsk, SpendWarning } from "../agent/types.ts";
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

/**
 * Stable digest of an ask (reason + scrubbed question) used to ping the owner
 * once per schedule per question (AUTONOMY-2). Hex SHA-256 of the SAFE-6
 * scrubbed text, so a stored key never derives from a raw secret.
 */
export function askPingKey(ask: HumanAsk): string {
  // SAFE-8: a spend-cap question carries live amounts; key on the reason so a
  // schedule pings once per cap episode (a clean run re-arms it).
  const body = ask.reason === "spend-cap" ? "" : scrubSecrets(ask.question).trim();
  return createHash("sha256")
    .update(`${ask.reason}\n${body}`)
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
 * Discord post for a run that needs a human. The owner mention sits on the
 * first line so a length cut can never drop the ping.
 */
export function formatAskReply(opts: FormatAskReplyOpts): AskReply {
  const stuck = opts.ask.reason === "stuck";
  const spendCap = opts.ask.reason === "spend-cap";
  const owner = opts.owner?.discordId ? opts.owner : null;
  const headline = stuck
    ? "⚠️ I'm stuck and need a human."
    : spendCap
    ? SPEND_CAP_HEADLINE
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
    status: stuck
      ? "⚠️ Stuck — asked for help"
      : spendCap
      ? SPEND_CAP_STATUS
      : "❓ Needs your input",
    failed: stuck,
    ownerPinged: Boolean(owner),
  };
}

/** SAFE-8 spend-cap ask headline: the run paused before a provider call. */
export const SPEND_CAP_HEADLINE =
  "💸 I paused before spending more — the daily spend cap needs you.";
export const SPEND_CAP_STATUS = "💸 Paused at the spend cap";

export type SpendWarningReply = {
  /** One line appended to the run's post. */
  line: string;
  /** The owner, when set, so the line can ping them. */
  mentionUserIds: string[];
};

/**
 * SAFE-8 80% warning line for a Discord post, rebuilt from the warning's
 * amounts (never from child text). Pings the configured owner when set; the
 * runner records each warning once per crossing, so this pings at most once.
 */
export function formatSpendWarningReply(
  warning: SpendWarning,
  owner: OwnerRecord | null | undefined,
): SpendWarningReply {
  const id = owner?.discordId;
  const line = formatSpendWarningLine(warning);
  return {
    line: id ? line.replace(/^⚠️ /, `⚠️ <@${id}> `) : line,
    mentionUserIds: id ? [id] : [],
  };
}

/**
 * A post with the SAFE-8 80% warning line appended (owner added to the
 * allowed mentions). Returns `post` unchanged when there is no warning.
 */
export function withSpendWarningPost<
  T extends { content: string; mentionUserIds?: string[] },
>(post: T, warning: SpendWarning | undefined, owner: OwnerRecord | null | undefined): T {
  if (!warning) return post;
  const w = formatSpendWarningReply(warning, owner);
  const ids = [...new Set([...(post.mentionUserIds ?? []), ...w.mentionUserIds])];
  return {
    ...post,
    content: appendPostLine(post.content, w.line),
    ...(ids.length ? { mentionUserIds: ids } : {}),
  };
}

/** `content` + a blank line + `line`, cutting `content` so the post stays ≤ max. */
export function appendPostLine(content: string, line: string, max = ASK_REPLY_MAX): string {
  const room = max - line.length - 2;
  if (room <= 0) return line.slice(0, max);
  const head = content.length <= room ? content : `${content.slice(0, room - 1)}…`;
  return head ? `${head}\n\n${line}` : line;
}
