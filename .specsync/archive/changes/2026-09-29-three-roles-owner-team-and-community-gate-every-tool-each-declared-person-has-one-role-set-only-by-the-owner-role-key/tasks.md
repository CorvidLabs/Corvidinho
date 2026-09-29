---
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
artifact: tasks
---

# Tasks

- [x] Capture IDENTITY-8..12 (hi/identity.md) and ADMIN-3.b (hi/admin.md) with `hi`, ROLES-CHAT-8.a (hi/roles.md) by hand, from Leif's 2026-09-28 interview; notes that called the two-tier gate an interim now point at IDENTITY-8..12; `hi check` green.
- [x] Re-verify the gap on the stacked base 72fec65: two tiers only, no `role` key, no `/admin people role`, owner-only `/work` PR, no docs / milestone reader.
- [x] `src/identity/people.ts`: `role` key (exactly one of owner / team / community; a list or unknown value skips the entry), `roleOfPerson`, `normalizePersonRole`, owner-role issues, `resolvePerson.role`.
- [x] `src/plugins/roles.ts`: `resolveActingRole`, `actingRoleCap`, `actingWorkTask`, `roleAllowsPlugin`, `TEAM_REVIEW_TOOLS`, `TEAM_WORK_TOOLS`; `runPlugin` gates on it; `checkRepoGateForActingRole` by role with `write` (the four GitHub write commands pass it).
- [x] `src/agent/tools.ts` / `execute.ts`: catalog by role (`actingRole`, `workTask`) resolved per attempt; invented-call refusal by role; Fledge discovery owner / no-role only; ROLES-CHAT-8.a public Q&A prompt.
- [x] `plugins/github/public-docs.ts`: `github-docs-read`, `github-milestone-list`, registered in `plugins/github/index.ts`.
- [x] Discord: `resolveDiscordActingRole`; spawn client stamps `CORVIDINHO_ACTING_ROLE` / `CORVIDINHO_ACTING_WORK_TASK`; bridge chat + button pick, `/session start`, `/work` (work flag; PR for owner or team, re-resolved after the run).
- [x] `/admin people role` (ADMIN-3.b): writer `op: "role"` (render / compare the `role` key), handler (usage, audit args, replies), slash body (`person`, `role` choices), `people list` roles, `config show` role counts.
- [x] Tests: `tests/roles.team.test.ts` (24), `tests/github.public-docs.test.ts` (10), `tests/discord.admin-slash.test.ts` body shape; fail on the base sources (two files fail to load, the body test fails; a behavioural copy on base exports fails 6/6), pass on the branch.
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/WATCH.md`, `allowlist.example.toml`, `STATUS.md`; specs prose and `files:` (`plugins`, `agent`, `discord`), `specs/*/testing.md`; deltas Added REQ-plugins-065 / REQ-plugins-066 / REQ-agent-065 / REQ-discord-065, Modified REQ-discord-043 / REQ-discord-088.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
- [x] Review fixes: team `github-pr-review` is `COMMENT` only (`APPROVE` / `REQUEST_CHANGES` owner-only); team `/work` `files-write` / `files-edit` refuse secret-looking paths; `github-docs-read` refuses and hides secret-looking doc paths for non-owner sessions; Modified REQ-agent-501 (the role filter now names community and team); tests fail on the pre-review sources and pass after.
