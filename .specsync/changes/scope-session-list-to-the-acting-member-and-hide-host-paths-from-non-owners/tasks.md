---
change: scope-session-list-to-the-acting-member-and-hide-host-paths-from-non-owners
artifact: tasks
---

# Tasks

- [x] Reproduce on `main`: a member's `/session list` shows other users' sessions and absolute host paths (5 of 7 new behaviour tests fail).
- [x] Add `src/discord/list-scope.ts` (`actorIsAdmin`, `projectLabel`).
- [x] Scope `/session list`: ADMIN sees all with full paths; others see only their own with the project name.
- [x] `/schedule list`: non-ADMIN sees the project name, never an absolute host path.
- [x] Check `/status`, `/agents`, `/work` for the same leak (counts-only / static / no list) and lock `/status` with a test.
- [x] Regression tests in `tests/discord.session-list-scope.test.ts`; new files listed in `specs/discord/discord.spec.md` `files:`.
- [x] Added delta for REQ-discord-418.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test` and `fledge lanes run verify --non-interactive`.
