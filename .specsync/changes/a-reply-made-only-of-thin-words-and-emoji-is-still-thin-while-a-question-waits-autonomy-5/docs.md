---
change: a-reply-made-only-of-thin-words-and-emoji-is-still-thin-while-a-question-waits-autonomy-5
artifact: docs
---

# Docs

- `docs/discord.md`: the AUTONOMY-5/6 thin-reply paragraph says a reply
  made only of thin words and emoji (`ok 👍`, `hmm ok`, `sure, ok`,
  split on spaces and commas) is thin too, in a reply or a question's private
  form, and that any other word or a number (`ok use postgres`, `2 👍`,
  `2`) is an answer.
- `specs/discord/discord.spec.md`: the `thin-ack.ts` line says what
  `isThinAck` accepts.
- `specs/discord/requirements.md` (REQ-discord-044, through the delta) and
  `specs/discord/testing.md` (evidence section).
- No README, CHANGELOG, STATUS or package.json edit (the release PR writes
  them).
