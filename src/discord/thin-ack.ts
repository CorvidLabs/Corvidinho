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

/**
 * Discord custom emoji `<:name:id>` or animated `<a:name:id>`, unicode emoji,
 * ZWJ / variation selector / keycap / skin tone. One character per step: a
 * long ZWJ chain that ends in a letter then fails at once instead of trying
 * every way to split it (the ZWJ and U+FE0F are emoji components themselves).
 */
const EMOJI_CHUNK_RE =
  /^(?:<a?:\w+:\d+>|[\p{Extended_Pictographic}\p{Emoji_Component}])+$/u;

/** A Discord custom emoji tag (its name and id may hold digits). */
const CUSTOM_EMOJI_RE = /<a?:\w+:\d+>/g;

/** An ASCII digit that is not part of a keycap emoji (`2️⃣`). */
const BARE_DIGIT_RE = /[0-9](?![\uFE0F\u20E3])/;

/**
 * Emoji only. Unicode counts the ASCII digits as emoji components, but a bare
 * digit is a real answer (`2` picks option 2), never an emoji.
 */
function isEmojiOnly(s: string): boolean {
  return (
    s.length > 0 &&
    EMOJI_CHUNK_RE.test(s) &&
    !BARE_DIGIT_RE.test(s.replace(CUSTOM_EMOJI_RE, ""))
  );
}

/** One space- or comma-separated piece: a listed thin word or emoji only. */
function isThinPiece(piece: string): boolean {
  return THIN_WORD_RE.test(piece) || isEmojiOnly(piece);
}

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
  if (isEmojiOnly(t.replace(/\s+/g, ""))) return true;
  // Only listed thin words and emoji, split on spaces / commas: `ok 👍`,
  // `hmm ok`, `sure, ok`. Any other piece makes it an answer (`2 👍`).
  const pieces = t.split(/[\s,]+/).filter(Boolean);
  if (pieces.length > 0 && pieces.every(isThinPiece)) return true;
  // Very short non-answer: 1–2 chars that aren't a real choice token.
  if (t.length <= 2 && !/^[0-9a-z]+$/i.test(t)) return true;
  return false;
}

/** Short public ack when the human cancels a pending ask. */
export const ASK_CANCELLED_ACK = "Got it — cancelled. Ready when you have a real answer.";
