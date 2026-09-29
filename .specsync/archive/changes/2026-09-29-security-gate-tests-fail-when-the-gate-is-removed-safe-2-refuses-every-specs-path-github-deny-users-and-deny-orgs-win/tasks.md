---
change: security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win
artifact: tasks
---

# Tasks

- [x] SAFE-2 `specs/` tests: files-write / edit / delete and git-commit deletion (`tests/files.plugins.test.ts`, `tests/git.plugins.test.ts`).
- [x] GitHub deny tests: router `deny_users` / `deny_orgs` (`tests/watch.router.test.ts`), git-push `deny_orgs` (`tests/git.plugins.test.ts`).
- [x] ROLES-CHAT-8 real visibility lookup tests over a stubbed fetch (`tests/github.public.community.test.ts`).
- [x] DISCORD-8 live-path tests with a stubbed gateway login (`tests/discord.requester-perms.test.ts`).
- [x] All new tests pass on main's source (no gate broken, no code fix needed).
- [x] Mutation proof: each gate disabled in turn makes its new tests fail; source restored.
- [x] Spec testing evidence and deltas (REQ-plugins-493 Added; REQ-plugins-004/083/182, REQ-watch-003, REQ-discord-012 Modified).
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.
