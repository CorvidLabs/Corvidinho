---
change: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
artifact: plan
---

# Plan

1. Capture IDENTITY-13 / 14 / 6 / 7 and ADMIN-3.a with `hi` (first
   commit); `hi check`.
2. `src/identity/people.ts`: reader, directory, `resolvePerson`,
   `loadDeclaredPeople`.
3. Discord: `identity-inject.ts` takes `people`; bridge chat + pick resume,
   `/session start`, `/work` pass it.
4. WATCH: `senderId` from the search clients, `RouterDeps.people`,
   `formatWatchIdentityBlock`, poller wiring with the owner.
5. `src/discord/admin-people.ts` writer; `/admin people` routes, list view,
   `config show` count; slash body `people` group.
6. Tests: `tests/identity.people.test.ts`,
   `tests/discord.admin-people.test.ts`, `tests/identity.recognise.test.ts`;
   update `tests/discord.admin-slash.test.ts` body shape; prove fail on base.
7. Docs: `docs/discord.md`, `docs/WATCH.md`, `docs/DISCORD-GO-LIVE.md`,
   `allowlist.example.toml`, `STATUS.md`; spec prose, `files:`, testing.
8. `specsync check --require-coverage 100`, `hi check`, `bunx tsc
   --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
