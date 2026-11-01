---
change: a-reply-made-only-of-thin-words-and-emoji-is-still-thin-while-a-question-waits-autonomy-5
artifact: tasks
---

# Tasks

- [x] `src/discord/thin-ack.ts`: `isThinAck` accepts text whose whitespace/comma pieces are each a listed thin word or emoji; `isEmojiOnly` never counts a bare ASCII digit (custom emoji ids and keycaps excepted).
- [x] Tests: 2 unit and 3 bridge cases in `tests/discord.thin-ack.test.ts`, one Answer form case in `tests/discord.ask-answer-modal.test.ts`, one schedule ask form case in `tests/discord.schedule-ask.test.ts`.
- [x] Fail-on-base proof: main's `thin-ack.ts` swapped in → the 7 new tests fail; restored → pass.
- [x] Docs: `docs/discord.md` thin-reply paragraph; `specs/discord/discord.spec.md` `thin-ack.ts` line.
- [x] Spec: REQ-discord-044 Modified delta; `specs/discord/testing.md` evidence section.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
