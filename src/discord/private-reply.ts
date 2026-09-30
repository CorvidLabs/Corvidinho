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

import { boundPrivateReplies, NDJSON_LIMITS } from "../agent/events-ndjson.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { defangMassMentions } from "./allowed-mentions.ts";
import { splitDiscordMessage } from "./rich-reply.ts";

/** A direct message to one user (gateway `sendDm`); null when it did not go out. */
export type SendPrivateDm = (opts: {
  userId: string;
  content: string;
}) => Promise<{ channelId: string; messageId: string } | null>;

/** At most this many private replies are taken from one run. */
export const PRIVATE_REPLIES_MAX = NDJSON_LIMITS.privateReplies;
/** Longest private reply taken from a run (three messages' worth). */
export const PRIVATE_REPLY_TEXT_MAX = NDJSON_LIMITS.privateReplyText;
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
 * Validated `privateReplies` from a child's result frame, bounded as the
 * child bounds them (`boundPrivateReplies`): non-empty strings only, at most
 * {@link PRIVATE_REPLIES_MAX}, each scrubbed and then cut to
 * {@link PRIVATE_REPLY_TEXT_MAX} with a visible marker (a note on the last
 * one says how many more were left out). Anything else ⇒ undefined.
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
