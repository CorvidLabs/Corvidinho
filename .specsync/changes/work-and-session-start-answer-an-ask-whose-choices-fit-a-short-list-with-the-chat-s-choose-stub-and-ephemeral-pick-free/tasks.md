---
change: work-and-session-start-answer-an-ask-whose-choices-fit-a-short-list-with-the-chat-s-choose-stub-and-ephemeral-pick-free
artifact: tasks
---

# Tasks

- [x] Re-verify the gap on main 1c7b6ce: `/work` / `/session start` store the ask without its options and post the question as public text; not already fixed.
- [x] Regression tests `tests/discord.slash-choose-ask.test.ts` (10 tests); the 6 bridge tests for listable options fail on the base sources and pass on the branch (the free-text guard passes on both).
- [x] `buttonAskFor` / `ButtonAsk` in `src/discord/ask-buttons.ts`.
- [x] `/work` and `/session start` answer with the Choose stub and store the button pending ask; `recordSlashStub` records the stub id.
- [x] `finishSlashWithThinking` / `finishSlashWithOwnerNotice` carry `components` and pass the answer `messageId` to `onDelivered`; `SlashReplyPayload.components` forwarded by the live gateway.
- [x] `tests/discord.slash-pending-ask.test.ts`: the two "options dropped" tests now use asks whose options cannot be listed.
- [x] `docs/discord.md`, `specs/discord/discord.spec.md` (prose, `files:`), `specs/discord/testing.md`; delta Modified REQ-discord-044.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
