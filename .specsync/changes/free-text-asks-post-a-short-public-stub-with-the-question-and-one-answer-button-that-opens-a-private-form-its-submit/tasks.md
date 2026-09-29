---
change: free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit
artifact: tasks
---

# Tasks

- [x] Answer button, modal payload, form custom id, `answerAskFor`, `normalizeAskAnswer`, `ASK_ANSWER_*` (`src/discord/ask-buttons.ts`); exports in `src/discord/index.ts`.
- [x] `formatAskReply({ answerButton })` + `ASK_ANSWER_HINT` (`src/discord/ask-ping.ts`).
- [x] Gateway `showModal` / `modalValues`, `adaptModalSubmit`, `modalTextValues`, MODAL_SUBMIT → `onComponent` (`src/discord/gateway.ts`).
- [x] Bridge: Answer button on chat / resume free-text posts and live restatements; modal on the requester's press; submit through the press gates and the pick's resume code with the reply's block; late free-text press keeps the ask; press/submit id mix-up ignored (`src/discord/bridge.ts`).
- [x] Slash `/work` and `/session start` free-text answers carry the button and record the stub (`src/discord/command-handlers/work.ts`, `session.ts`).
- [x] `keepFooter` in `ThinkingStatus.finalizeContent`, `finishSlashWithThinking`, the owner-notice re-edit (`thinking-status.ts`, `slash-finish.ts`, `spend-post.ts`).
- [x] Tests: new `tests/discord.ask-answer-modal.test.ts`; updated `tests/discord.ask-ping.test.ts`, `tests/discord.thin-ack.test.ts`, `tests/discord.slash-pending-ask.test.ts`, `tests/discord.slash-choose-ask.test.ts`.
- [x] Fail-on-base proof (base `src/discord` swapped in, then the helpers only, then restored).
- [x] `docs/discord.md`; spec delta (REQ-discord-548 Added); `specs/discord/discord.spec.md` prose, scenario and `files:`; `specs/discord/testing.md`.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.
