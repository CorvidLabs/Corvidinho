---
change: a-reply-made-only-of-thin-words-and-emoji-is-still-thin-while-a-question-waits-autonomy-5
artifact: requirements
---

# Requirements

- AUTONOMY-5 (captured on main, `hi/autonomy.md`): "While a session is
  waiting on an ask, thin replies (`ok`, `k`, `sure`, `hmmm`,
  emoji-only, and similar) do not clear blocked or mark done; restate the
  pending question once (no vacuous 'ready when you are')." Kept:
  AUTONOMY-6 (cancel), AUTONOMY-6.a / 6.b, DISCORD-ASK-4.a, SESSION-MULTI-3.
- Modified (full text kept, one paragraph and three acceptance bullets
  added): REQ-discord-044 — what counts as a thin reply (pieces split on
  whitespace and commas, each a listed thin word or an emoji; a bare ASCII
  digit is never an emoji) for chat, the private Answer form and a schedule
  ask's form.
- REQ-discord-548 and REQ-discord-606 already defer to `isThinAck` and are
  unchanged.
- No new thin word, env var, config key, command, table or column.
