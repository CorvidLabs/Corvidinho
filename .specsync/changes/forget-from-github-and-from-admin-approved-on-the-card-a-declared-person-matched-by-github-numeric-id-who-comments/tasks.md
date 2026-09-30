---
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
artifact: tasks
---

# Tasks

- [x] Capture MEMORY-ACL-6.a by hand under MEMORY-ACL-6 in `hi/memory.md` from Leif's 2026-09-28 interview (round 12); `hi check` green; own commit.
- [x] Re-verify the gap on main (20a0f58): GitHub "forget me" is a model run whose `memory-forget-me` is refused; no `/admin people forget`; `forgetTargets` takes any requester for a Discord id; kept WATCH threads hold logins only.
- [x] `src/memory/forget.ts` asker kinds + GitHub origin + `unnotifiedGithub` + targets; `src/memory/scope.ts` `memorySubjectForPerson`; `src/store/conversation.ts` `githubIdParticipant` / delete by id; `src/memory/index.ts` exports.
- [x] `src/discord/forget-card.ts`: asker line per kind, GitHub asks left to the poller, admin asks marked told, audit actor per kind.
- [x] `/admin people forget`: `command-handlers/admin.ts`, `slash-commands.ts`, `slash-types.ts`, `bridge.ts` wiring.
- [x] `src/watch/forget-me.ts` and `src/watch/poller.ts` wiring; `plugins/memory/commands.ts` GitHub refusal text.
- [x] Tests: `tests/watch.forget-me.test.ts` (3), `tests/discord.admin-forget.test.ts` (5), `tests/discord.admin-slash.test.ts` (subcommand list); all 9 fail on main (20a0f58) on their assertions and pass on the branch.
- [x] Docs: `docs/discord.md`, `docs/WATCH.md`, `docs/DISCORD-GO-LIVE.md`; spec prose and `files:` (`discord`, `watch`, `plugins`), `specs/*/testing.md`; deltas Added REQ-discord-1016 / REQ-watch-1016 / REQ-plugins-1016.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
