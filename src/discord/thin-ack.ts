/**
 * AUTONOMY-5/6 — detect thin acknowledgements and explicit cancels while a
 * session is waiting on a pending ask. Pure string checks; no I/O.
 */

/** Explicit cancel phrases that clear a pending ask (AUTONOMY-6). */
const CANCEL_RE =
  /^(cancel|never\s*mind|nevermind|forget\s*it|stop\s*asking|n\/?m)\s*[.!]?$/i;

/**
 * Whole-message thin acks: ok/k/sure/hmmm/yeah/yep and similar, or emoji-only /
 * whitespace / very short non-answers. Cancel phrases are NOT thin (call
 * `isCancelAsk` first).
 */
const THIN_WORD_RE =
  /^(ok|okay|k|kk|sure|yep|yeah|ya|yup|y|yea|alright|all\s*right|fine|cool|got\s*it|sounds\s*good|h+m+|uh+\s*huh|mhm|mm+|👍|👌|✅|😂|😅|🙏|👀|🔥|💯|✨|🙂|😊|😄|😉|👏|🙌)(?:\s*[.!…]*)?$/iu;

/** Discord custom emoji `<:name:id>` or animated `<a:name:id>`, unicode emoji, ZWJ. */
const EMOJI_CHUNK_RE =
  /^(?:<a?:\w+:\d+>|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*|\p{Emoji_Component})+$/u;

/**
 * True when `text` is an explicit cancel of the pending ask (AUTONOMY-6).
 */
export function isCancelAsk(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return CANCEL_RE.test(t);
}

/**
 * True when `text` is a thin acknowledgement that must not clear blocked /
 * mark done (AUTONOMY-5). Empty / whitespace-only counts as thin.
 * Cancel phrases return false (handle via `isCancelAsk`).
 */
export function isThinAck(text: string): boolean {
  const raw = text.trim();
  if (!raw) return true;
  if (isCancelAsk(raw)) return false;
  const t = raw.replace(/\s+/g, " ");
  if (THIN_WORD_RE.test(t)) return true;
  // Emoji-only (one or more), optionally with spaces between.
  const noSpace = t.replace(/\s+/g, "");
  if (noSpace.length > 0 && EMOJI_CHUNK_RE.test(noSpace)) return true;
  // Very short non-answer: 1–2 chars that aren't a real choice token.
  if (t.length <= 2 && !/^[0-9a-z]+$/i.test(t)) return true;
  return false;
}

/** Short public ack when the human cancels a pending ask. */
export const ASK_CANCELLED_ACK = "Got it — cancelled. Ready when you have a real answer.";
