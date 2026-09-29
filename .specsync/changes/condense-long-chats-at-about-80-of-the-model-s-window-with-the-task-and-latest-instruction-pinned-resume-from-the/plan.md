---
change: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
artifact: plan
---

# Plan

1. Confirm the captured ids on the stacked base (`grep` + `hi check`); no
   capture commit needed.
2. `src/store/conversation.ts` + schema v12 + `SCRUB_TARGETS`.
3. `SessionStore` condensing, keeping, resuming, forgetting; router
   SESSION-3.a path; bridge wiring and purge timer.
4. WATCH poller replay and record.
5. Tests: `tests/session.condense.test.ts`, `tests/store.conversation.test.ts`,
   `tests/discord.session-resume.test.ts`, `tests/watch.conversation.test.ts`;
   update the unit renderer test and the two schema-version pins; prove the
   new tests fail on the base sources and pass on the branch.
6. Docs (`docs/discord.md`, `docs/WATCH.md`, `docs/BOX-UPDATE.md`,
   `docs/DISCORD-GO-LIVE.md`, `.env.example`, `STATUS.md`), spec prose,
   `files:`, testing notes, deltas.
7. `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
