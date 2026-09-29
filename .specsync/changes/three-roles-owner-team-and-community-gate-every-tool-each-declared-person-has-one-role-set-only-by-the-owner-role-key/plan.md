---
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
artifact: plan
---

# Plan

1. `specsync change new` (base = the #36 head), then capture IDENTITY-8..12
   and ADMIN-3.b with `hi`, ROLES-CHAT-8.a by hand (one commit); `hi check`.
2. `src/identity/people.ts`: `role` key (one of owner / team / community,
   fail closed), `roleOfPerson`, owner-role issues; `resolvePerson.role`.
3. `src/plugins/roles.ts`: `resolveActingRole`, `actingRoleCap`,
   `actingWorkTask`, `roleAllowsPlugin`, `TEAM_REVIEW_TOOLS`,
   `TEAM_WORK_TOOLS`; `runPlugin` gate; `checkRepoGateForActingRole` by role
   with `write` (GitHub write commands pass it).
4. `src/agent/tools.ts` + `execute.ts`: catalog by role per attempt; invented
   call refusal by role; ROLES-CHAT-8.a prompt.
5. `plugins/github/public-docs.ts`: `github-docs-read`,
   `github-milestone-list`; register.
6. Discord: `resolveDiscordActingRole`; spawn client stamps; bridge chat +
   button pick, `/session start`, `/work` (work flag, team PR, re-resolved);
   `/admin people role` (writer op, handler, slash body, list, config show).
7. Tests: `tests/roles.team.test.ts`, `tests/github.public-docs.test.ts`,
   `tests/discord.admin-slash.test.ts` body shape; prove fail on base.
8. Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/WATCH.md`,
   `allowlist.example.toml`, `STATUS.md`; spec prose, `files:`, testing.
9. `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
