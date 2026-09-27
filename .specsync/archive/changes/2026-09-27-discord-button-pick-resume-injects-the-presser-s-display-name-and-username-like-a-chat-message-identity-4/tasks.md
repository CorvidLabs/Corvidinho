---
change: discord-button-pick-resume-injects-the-presser-s-display-name-and-username-like-a-chat-message-identity-4
artifact: tasks
---

# Tasks

- [x] Re-check the gap on current `main` (1c7b6ce): the pick path passes only `{ userId, owner }` and `ComponentInteraction` has no name fields.
- [x] Add `userDisplayName` / `userUsername` to `ComponentInteraction` and `componentActorNames` in `src/discord/gateway.ts`; `adaptComponent` fills them.
- [x] Pass the presser's names to `enrichPromptWithIdentity` on the button-pick resume in `src/discord/bridge.ts`.
- [x] Regression tests in `tests/discord.identity-pick.test.ts`; prove they fail with `main`'s sources and pass on the branch.
- [x] Added delta REQ-discord-446; spec Public API paragraph, spec `files:`, `specs/discord/testing.md` and `docs/discord.md` updated.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test` and `fledge lanes run verify --non-interactive`.
