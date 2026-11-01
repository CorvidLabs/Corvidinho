---
change: a-reply-made-only-of-thin-words-and-emoji-is-still-thin-while-a-question-waits-autonomy-5
artifact: context
---

# Context

- AUTONOMY-5 (captured on main, `hi/autonomy.md`): "While a session is
  waiting on an ask, thin replies (`ok`, `k`, `sure`, `hmmm`,
  emoji-only, and similar) do **not** clear blocked or mark done; restate the
  pending question once (no vacuous 'ready when you are')." No new
  criterion, no `hi` capture.
- Gap (W14, checked on `origin/main` 49273ff): `isThinAck` only knew one
  thin word or emoji only. A reply that mixes them (`ok 👍`, `👍 ok`,
  `hmm ok`, `yeah ok`, `sure, ok`, `k k`, `OK 👍👍`) was not thin:
  on a free-text ask it cleared the ask and ran the agent; on a Choose ask it
  ran as ordinary chat instead of restating; in the private Answer form and a
  schedule ask's form it was taken as the answer.
- Found while checking it: the emoji-only test used
  `\p{Emoji_Component}`, which Unicode gives the ASCII digits, so `2`,
  `12` and `2 👍` counted as emoji (thin) on main, although the
  short-non-answer rule beside it treats digits as real choice tokens.
- Every thin gate (chat continue in `bridge.ts`, the Answer form submit
  in `bridge.ts`, the schedule ask form in `schedule-ask.ts`) already
  calls `isThinAck`, so the fix is in `src/discord/thin-ack.ts` only.
