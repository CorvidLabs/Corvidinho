---
change: work-and-session-start-answer-an-ask-whose-choices-fit-a-short-list-with-the-chat-s-choose-stub-and-ephemeral-pick-free
artifact: plan
---

# Plan

1. Re-check the gap on current main (1c7b6ce): the slash handlers still drop
   the options and answer with free text.
2. Regression tests `tests/discord.slash-choose-ask.test.ts`; confirm the
   bridge tests fail on the base sources.
3. `buttonAskFor` in `ask-buttons.ts`; slash handlers use it;
   `components` / `messageId` through `finishSlashWithThinking` and
   `finishSlashWithOwnerNotice`; `recordSlashStub`;
   `SlashReplyPayload.components` in the live gateway adapter.
4. Update `tests/discord.slash-pending-ask.test.ts` (the two tests that
   pinned "options dropped" now use asks whose options cannot be listed).
5. Docs (`docs/discord.md`), spec prose, `files:` and testing notes;
   delta Modified REQ-discord-044.
6. `specsync check --require-coverage 100`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
