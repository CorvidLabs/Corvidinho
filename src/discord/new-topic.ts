/**
 * SESSION-3.b (REQ-discord-479) — "Only /session start or my saying 'new
 * topic' starts a fresh session; a normal @mention keeps continuing the open
 * one."
 *
 * The fixed phrase the router looks for (message-router.ts `new_topic`) and
 * the one fixed reply to the phrase on its own. Only the phrase at the very
 * start of the message counts: no other wording, no heuristics, no model call.
 */

/**
 * 'new topic' at the very start of the text, any case, then the end, or
 * whitespace, or one optional `:` / `-` (also `–` / `—`) / `,` before the
 * request. On its own it may end in `.` / `!`. Nothing else counts: 'new
 * topics', 'new topic's', the phrase later in the text.
 */
const NEW_TOPIC_RE = /^new\s+topic(?:\s*[.!]*\s*$|\s*[:,\-–—]\s*|\s+)/i;

/** The IDENTITY-5 `[mentioned: …]` trailer `stripMentions` appends. */
const MENTION_TRAILER_RE = /\n\[mentioned:[^\]]*\]\s*$/;

/**
 * The one fixed reply to a 'new topic' with nothing after it: the open
 * session is parked and the fresh one takes the next message.
 */
export const NEW_TOPIC_ACK = "New topic — your next message starts it fresh.";

/**
 * The request after a leading 'new topic' in a routed prompt (`stripMentions`
 * output, so the bot mention is gone): the rest of the text, keeping the
 * IDENTITY-5 mention trailer; `""` when nothing follows the phrase; `null`
 * when the text does not begin with it.
 */
export function newTopicRequest(prompt: string): string | null {
  const trailer = MENTION_TRAILER_RE.exec(prompt);
  const body = (trailer ? prompt.slice(0, trailer.index) : prompt).trim();
  const hit = NEW_TOPIC_RE.exec(body);
  if (!hit) return null;
  const rest = body.slice(hit[0].length).trim();
  return rest ? `${rest}${trailer ? trailer[0].trimEnd() : ""}` : "";
}
