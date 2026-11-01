---
change: a-reply-made-only-of-thin-words-and-emoji-is-still-thin-while-a-question-waits-autonomy-5
artifact: design
---

# Design

- `isThinAck` keeps its order: blank → thin; cancel → not thin; whole text
  in `THIN_WORD_RE` → thin; emoji only → thin; then the new step; then the
  1–2 character non-answer rule.
- New step: split the text on whitespace and commas (`/[\s,]+/`); when
  every piece is a word of `THIN_WORD_RE`'s existing list (its own
  trailing `.`/`!`/`…` allowance kept) or emoji only, the text is thin.
  No word is added to the list, and nothing new is read from env or config.
- `isEmojiOnly` wraps `EMOJI_CHUNK_RE` and refuses a bare ASCII digit
  (one not followed by U+FE0F or U+20E3, so keycaps such as `2️⃣` stay
  emoji as on main), judged after Discord custom emoji tags
  (`<:name:id>`, whose ids are digits) are removed. Used for the whole text
  and for each piece, so `2` and `2 👍` are answers, `<:party:123> ok`
  is thin.
- Multi-word list entries (`got it`, `sounds good`, `all right`,
  `uh huh`) still match as a whole message, but split into pieces they
  are not list words, so `got it 👍` stays an answer (the conservative
  reading of "split on whitespace/commas into pieces that are each a listed
  word"; pending Leif). A word glued to an emoji without a space
  (`ok👍`) is one piece and stays an answer (pending Leif).
- Callers are unchanged: the chat gate restates the newest ask once (Choose
  stub + Choose button, or the question + Answer button), the Answer form
  and the schedule ask form restate privately.
