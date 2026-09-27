---
change: a-talk-stored-with-a-prefix-only-worktree-name-before-the-digest-change-keeps-it-after-upgrade-and-a-new-talk-whose-id
artifact: tasks
---

# Tasks

- [x] Reproduce the prefix collision on `main` with Discord-shaped session ids and confirm the PR #206 digest fix.
- [x] Regression test in `tests/discord.session-worktree.test.ts`: a pre-digest stored talk keeps its path and branch after a store reopen, and a new talk sharing its 16-char prefix leaves it intact (fails on `main`'s `manager.ts`).
- [x] Fix the stale branch pattern in `docs/discord.md`.
- [x] Modified `REQ-discord-241` delta (one added acceptance criterion).
- [x] Typecheck, `bun test`, `specsync check`, fledge verify green.
