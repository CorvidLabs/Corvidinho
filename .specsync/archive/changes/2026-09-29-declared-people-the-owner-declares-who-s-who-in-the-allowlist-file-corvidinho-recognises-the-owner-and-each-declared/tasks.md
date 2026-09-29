---
change: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
artifact: tasks
---

# Tasks

- [x] Capture IDENTITY-13, IDENTITY-14, IDENTITY-6, IDENTITY-7 (hi/identity.md) and ADMIN-3.a (hi/admin.md) with `hi` from Leif's 2026-09-28 interview; `hi check` green.
- [x] Re-verify the gap on main 246cb6c: no declared people, no `/admin people`, WATCH knows only the login.
- [x] `src/identity/people.ts`: TOML/JSON readers (fail closed), `buildPeopleDirectory` (owner person, clash-free indexes), `resolvePerson`, `loadDeclaredPeople`, link normalizers.
- [x] Discord recognition: `identity-inject.ts` (`people`, `resolveActingPerson`); bridge chat + pick resume, `/session start`, `/work` pass declared people.
- [x] WATCH recognition: `senderId` (Octokit + fixture), `RouterDeps.people`, `formatWatchIdentityBlock` / `WATCH_IDENTITY_HEADER`, poller loads the owner and re-reads people per event.
- [x] `src/discord/admin-people.ts` writer with the re-read safety net; `/admin people list|add|link|unlink|remove` (audited, fail closed); `config show` people count; slash body `people` group; `parseJsonObject` exported.
- [x] Tests: `tests/identity.people.test.ts` (9), `tests/discord.admin-people.test.ts` (15), `tests/identity.recognise.test.ts` (9); `tests/discord.admin-slash.test.ts` body shape updated; fail on the base sources, pass on the branch.
- [x] Docs: `docs/discord.md`, `docs/WATCH.md`, `docs/DISCORD-GO-LIVE.md`, `allowlist.example.toml`, `STATUS.md`; `specs/discord/discord.spec.md` (prose, `files:`), `specs/watch/watch.spec.md` (API prose), `specs/*/testing.md`; deltas Added REQ-discord-036 / REQ-watch-036, Modified REQ-discord-043 / REQ-discord-446.
- [x] Rebased on main 246cb6c (#232, #268, #269) without conflicts.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
