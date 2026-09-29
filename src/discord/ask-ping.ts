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
 *
 * An edit does not notify its mentions, so an answer collapsed into the
 * thinking message (DISCORD-ASK-6/7) is followed by the one-line
 * formatCollapsedPing post (REQ-discord-215).
 */

import { createHash } from "node:crypto";
import { formatSpendWarningLine } from "../agent/spend-notice.ts";
import { clipKeepingRoleNote } from "../agent/task-summary.ts";
import type { HumanAsk, SpendWarning } from "../agent/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { defangMassMentions } from "./allowed-mentions.ts";

export { defangMassMentions };

/** Ask posts stay under Discord's 2000 limit with room to spare. */
export const ASK_REPLY_MAX = 1900;
/** Run-summary chars a `/work`, `/session start` or schedule post shows. */
export const POST_SUMMARY_MAX = 1500;
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
  /**
   * Include "Reply to this message to answer." (reply-tracked posts only;
   * ignored for a spend-cap ask, which a reply cannot unblock).
   */
  replyHint?: boolean;
};

/**
 * Stable digest of an ask (reason + scrubbed question) used to ping once per
 * schedule per question (AUTONOMY-2). Hex SHA-256 of the SAFE-6 scrubbed
 * text, so a stored key never derives from a raw secret.
 */
export function askPingKey(ask: HumanAsk): string {
  // SAFE-8: a spend-cap question carries live amounts; key on the reason so a
  // schedule pings once per cap episode (a clean run re-arms it).
  const body = ask.reason === "spend-cap" ? "" : scrubSecrets(ask.question).trim();
  return createHash("sha256")
    .update(`${ask.reason}\n${body}`)
    .digest("hex");
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
 * SAFE-8: spend-cap → owner (the operator is the one who can lift the cap).
 */
export function formatAskReply(opts: FormatAskReplyOpts): AskReply {
  const stuck = opts.ask.reason === "stuck";
  const spendCap = opts.ask.reason === "spend-cap";
  const ownerId = opts.owner?.discordId?.trim() || "";
  const requesterId = opts.requesterDiscordId?.trim() || "";

  // Clarify addresses the requester; stuck pings the owner (AUTONOMY-2/4).
  // A spend-cap stop needs the operator, so it pings the owner too (SAFE-8);
  // callers pass `owner: null` once this cap episode already pinged.
  const pingId = stuck || spendCap ? ownerId : requesterId;
  const mentionUserIds = pingId ? [pingId] : [];
  const ping = pingId ? ` <@${pingId}>` : "";

  const headline = stuck
    ? "⚠️ I'm stuck and need a human."
    : spendCap
    ? SPEND_CAP_HEADLINE
    : "❓ I need your input before I can continue.";
  const lines: string[] = [];
  if (opts.prefix?.trim()) lines.push(clean(opts.prefix, 300));
  lines.push(`${headline}${ping}`);
  lines.push(quote(clean(opts.ask.question, ASK_REPLY_QUESTION_MAX)));
  if (stuck && opts.context?.trim()) {
    lines.push(clean(opts.context, ASK_REPLY_CONTEXT_MAX));
  }
  // SAFE-8: a reply cannot lift the cap (no Approve card yet, #96), so a
  // spend-cap ask never invites one.
  if (opts.replyHint && !spendCap) lines.push(ASK_REPLY_HINT);
  let content = lines.join("\n");
  if (content.length > ASK_REPLY_MAX) {
    content = `${content.slice(0, ASK_REPLY_MAX - 1)}…`;
  }
  const ownerPinged = Boolean(ownerId && mentionUserIds.includes(ownerId));
  return {
    content,
    mentionUserIds,
    status: stuck
      ? "⚠️ Stuck — asked for help"
      : spendCap
      ? SPEND_CAP_STATUS
      : "❓ Needs your input",
    failed: stuck,
    ownerPinged,
    pinged: mentionUserIds.length > 0,
  };
}

/**
 * SAFE-8 spend-cap ask headline: the run paused before a provider call. It
 * names the operator because a requester cannot lift the cap.
 */
export const SPEND_CAP_HEADLINE =
  "💸 I paused before spending more — the daily spend cap needs the operator.";
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
 * runner records each warning once per crossing and the bridge's outbox
 * (src/agent/spend-outbox.ts) hands it to exactly one post.
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
 * allowed mentions), cut to `max` (default ASK_REPLY_MAX; a chat answer the
 * bridge splits into messages passes its whole-answer cap, DISCORD-16).
 * Returns `post` unchanged when there is no warning.
 */
export function withSpendWarningPost<
  T extends { content: string; mentionUserIds?: string[] },
>(
  post: T,
  warning: SpendWarning | undefined,
  owner: OwnerRecord | null | undefined,
  max: number = ASK_REPLY_MAX,
): T {
  if (!warning) return post;
  const w = formatSpendWarningReply(warning, owner);
  const ids = [...new Set([...(post.mentionUserIds ?? []), ...w.mentionUserIds])];
  return {
    ...post,
    content: appendPostLine(post.content, w.line, max),
    ...(ids.length ? { mentionUserIds: ids } : {}),
  };
}

/**
 * `content` + a blank line + `line`, cutting `content` so the post stays ≤ max.
 * The cut keeps a closing "(not allowed for your role)" note (ROLES-CHAT-3,
 * REQ-discord-734): the body loses its end, never the note.
 */
export function appendPostLine(content: string, line: string, max = ASK_REPLY_MAX): string {
  const room = max - line.length - 2;
  if (room <= 0) return line.slice(0, max);
  const head = clipKeepingRoleNote(content, room, (text, n) =>
    n > 0 ? `${text.slice(0, n - 1)}…` : "",
  );
  return head ? `${head}\n\n${line}` : line;
}

/**
 * A run summary clipped for a post (REQ-discord-734, ROLES-CHAT-3): at most
 * POST_SUMMARY_MAX chars and no more than fits after a `headLength`-char post
 * head within ASK_REPLY_MAX, so the gateway's 1900 cut never reaches it. A
 * closing "(not allowed for your role)" note is kept (clipKeepingRoleNote,
 * REQ-agent-333); a summary without it is cut where a plain head cut would.
 */
export function clipPostSummary(summary: string, headLength = 0): string {
  const max = Math.max(0, Math.min(POST_SUMMARY_MAX, ASK_REPLY_MAX - headLength));
  return clipKeepingRoleNote(summary, max, (text, n) => text.slice(0, n));
}

/** Pointer for the user a collapsed answer asks a question (AUTONOMY-4). */
export const COLLAPSED_PING_QUESTION = "↑ question for you";
/** Pointer for a user a collapsed answer needs (owner: AUTONOMY-2, SAFE-8). */
export const COLLAPSED_PING_NEEDS = "↑ needs you";

export type CollapsedPing = {
  /** One line: only the mention(s) and their pointer. */
  content: string;
  /** Exactly the users mentioned in `content` (the post's allowed mentions). */
  mentionUserIds: string[];
};

/**
 * DISCORD-ASK-6/7 with AUTONOMY-2/4 and SAFE-8: Discord does not notify a
 * mention added by a message edit, so an answer collapsed into the thinking
 * message that mentions someone is followed by this short fresh post.
 * `questionUserIds` are the users the answer asks a question (the clarify
 * requester, "↑ question for you"); every other mentioned user is needed
 * ("↑ needs you": the owner on stuck, spend cap or the 80% warning).
 * Users in `alreadyPinged` (a fresh post already pinged them this turn, e.g.
 * the slash owner notice) are left out. Null when nobody is left to ping.
 */
export function formatCollapsedPing(opts: {
  mentionUserIds: readonly string[] | undefined;
  questionUserIds?: readonly string[];
  alreadyPinged?: readonly string[];
}): CollapsedPing | null {
  const skip = new Set((opts.alreadyPinged ?? []).map((id) => id.trim()));
  const ids = [
    ...new Set((opts.mentionUserIds ?? []).map((id) => id.trim()).filter((id) => id && !skip.has(id))),
  ];
  if (ids.length === 0) return null;
  const question = new Set((opts.questionUserIds ?? []).map((id) => id.trim()));
  const asked = ids.filter((id) => question.has(id));
  const needed = ids.filter((id) => !question.has(id));
  const part = (group: string[], pointer: string) =>
    group.length ? `${group.map((id) => `<@${id}>`).join(" ")} ${pointer}` : "";
  const content = [part(asked, COLLAPSED_PING_QUESTION), part(needed, COLLAPSED_PING_NEEDS)]
    .filter(Boolean)
    .join(" · ");
  return { content, mentionUserIds: [...asked, ...needed] };
}
