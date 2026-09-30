/**
 * MEMORY-7.a (#101 / REQ-discord-710) — private things only privately.
 *
 * A run's private replies (`privateReplies` on its result: private notes, a
 * profile read, the owner's view of someone's memory) are text the model
 * never saw — the memory plugins hand it past the model (REQ-plugins-710,
 * REQ-agent-710). The bridge sends it only to the person who asked, by
 * direct message (the forget card's `sendDm` path), on every surface that
 * runs the agent for someone: chat, a button pick or Answer form resume,
 * `/session start` and `/work`. The shared channel gets a short "sent
 * privately" note and never the text. When there is no DM path, or the DM
 * does not go out, nothing private is shown anywhere — the note says so.
 * Schedules and WATCH never deliver them (the plugins refuse those reads
 * there, and those surfaces ignore the field).
 */

import { scrubSecrets } from "../store/scrub.ts";
import { defangMassMentions } from "./allowed-mentions.ts";
import { DISCORD_ANSWER_MAX, splitDiscordMessage } from "./rich-reply.ts";

/** A direct message to one user (gateway `sendDm`); null when it did not go out. */
export type SendPrivateDm = (opts: {
  userId: string;
  content: string;
}) => Promise<{ channelId: string; messageId: string } | null>;

/** At most this many private replies are taken from one run. */
export const PRIVATE_REPLIES_MAX = 5;
/** Longest private reply taken from a run, cut marker included (three messages' worth). */
export const PRIVATE_REPLY_TEXT_MAX = DISCORD_ANSWER_MAX;
/** Ends a private reply cut at {@link PRIVATE_REPLY_TEXT_MAX}. */
export const PRIVATE_REPLY_CUT_MARKER = "\n… (cut here — ask for a narrower part to see the rest)";
/** A DM part stays within the gateway's direct-message cap (1900). */
export const PRIVATE_DM_PART_MAX = 1900;

/** First line of each private DM. */
export const PRIVATE_DM_HEADER = "🔒 Private — only you can see this (MEMORY-7.a):";

/** The channel's note when the private part went out by DM. */
export const PRIVATE_SENT_NOTE =
  "🔒 The private part was sent to you in a DM — it is never shown in a shared channel.";

/** The channel's note when it did not (no DM path, DMs closed, an error). */
export const PRIVATE_NOT_SENT_NOTE =
  "🔒 The private part is never shown in a shared channel, and I couldn't DM it to you — open your DMs to me and ask again.";

export type PrivateDelivery = "sent" | "failed";

/**
 * A run's private replies, bounded for the result frame and the DM: non-blank
 * strings only, at most {@link PRIVATE_REPLIES_MAX}, each secret-scrubbed
 * first (so a cut never leaves a token prefix a later scrub misses, SAFE-6)
 * and then cut to {@link PRIVATE_REPLY_TEXT_MAX} with
 * {@link PRIVATE_REPLY_CUT_MARKER}, never inside a surrogate pair. When more
 * came than are kept, the last one kept says how many were not sent.
 * `task run` bounds its result with it (so large private reads cannot push
 * the frame past the parser's line cap) and the agent client re-checks with
 * it; a bounded list comes back unchanged.
 */
export function boundPrivateReplies(texts: readonly unknown[]): string[] {
  const valid = texts.filter((t): t is string => typeof t === "string" && t.trim() !== "");
  const kept = valid.slice(0, PRIVATE_REPLIES_MAX);
  const dropped = valid.length - kept.length;
  return kept.map((text, i) => {
    const note =
      dropped > 0 && i === kept.length - 1
        ? `\n… (${dropped} more private ${dropped === 1 ? "result was" : "results were"} not sent — at most ${PRIVATE_REPLIES_MAX} per answer; ask again for the rest)`
        : "";
    return cutPrivateReply(scrubSecrets(text), PRIVATE_REPLY_TEXT_MAX - note.length) + note;
  });
}

function cutPrivateReply(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = Math.max(0, max - PRIVATE_REPLY_CUT_MARKER.length);
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}${PRIVATE_REPLY_CUT_MARKER}`;
}

/**
 * Validated `privateReplies` from a child's result frame, bounded as the
 * child bounds them ({@link boundPrivateReplies}). Anything else ⇒ undefined.
 */
export function privateRepliesFromUnknown(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = boundPrivateReplies(raw);
  return out.length > 0 ? out : undefined;
}

/**
 * Send a run's private replies to `userId` by direct message, scrubbed
 * (SAFE-6), mass mentions defanged and then split under the DM cap (so the
 * gateway's own defang and cap never cut a part). `null` when there were
 * none; `"failed"` when any part did not go out (or there is no DM path) —
 * never a channel fallback.
 */
export async function deliverPrivateReplies(opts: {
  replies: readonly string[] | undefined;
  userId: string;
  sendDm?: SendPrivateDm;
}): Promise<PrivateDelivery | null> {
  if (!opts.replies?.length) return null;
  const userId = opts.userId.trim();
  if (!opts.sendDm || !userId) return "failed";
  for (const text of opts.replies) {
    const parts = splitDiscordMessage(
      defangMassMentions(`${PRIVATE_DM_HEADER}\n${scrubSecrets(text)}`),
      PRIVATE_DM_PART_MAX,
    );
    for (const content of parts) {
      let sent: Awaited<ReturnType<SendPrivateDm>> = null;
      try {
        sent = await opts.sendDm({ userId, content });
      } catch {
        sent = null;
      }
      if (!sent) return "failed";
    }
  }
  return "sent";
}

/** The public answer with the "sent privately" note on top (none ⇒ unchanged). */
export function withPrivateNote(body: string, outcome: PrivateDelivery | null): string {
  if (!outcome) return body;
  const note = outcome === "sent" ? PRIVATE_SENT_NOTE : PRIVATE_NOT_SENT_NOTE;
  const text = body.trim();
  return text ? `${note}\n\n${text}` : note;
}
