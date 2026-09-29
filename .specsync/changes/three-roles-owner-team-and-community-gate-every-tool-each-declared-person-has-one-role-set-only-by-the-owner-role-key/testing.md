---
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
artifact: testing
---

# Testing

Fixture tests only: temp allowlist files, dry-run GitHub writes, a real
Octokit with a mocked fetch, a scripted LLM provider, fake spawn bins,
`startBridge` with a null gateway and the slash handlers directly; no live
Discord or GitHub, no token, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-065` | `tests/roles.team.test.ts` ("IDENTITY-8: one role per declared person …") | `role = "team"` / `"community"` (any case, TOML and JSON) resolve; no role and undeclared ⇒ community; the owner ⇒ owner; a list, an unknown or an empty role skips the entry with an issue naming the person, never an id; `role = "owner"` elsewhere ⇒ community with an issue; the owner's person declared community stays owner; no owner ⇒ nobody is owner. |
| `REQ-plugins-065` | `tests/roles.team.test.ts` ("IDENTITY-12: the tool layer resolves the role on every call") | No role session ⇒ null; owner + bridge bit ⇒ owner; team person with a team stamp ⇒ team, with a community stamp or none ⇒ community; owner stamp for a team person ⇒ team; undeclared / community / no-role / empty actor with a team stamp ⇒ community; a file edit, mute, deny-list or unreadable file applies at the next call. `roleAllowsPlugin` checked for every registered plugin and role. |
| `REQ-agent-065` | `tests/roles.team.test.ts` ("IDENTITY-9..11: the catalog by role") | With every dangerous plugin allowlisted: owner and null equal the ADMIN catalog, community equals the non-ADMIN one (no mutating plugin), team adds only the two review tools (and exactly `files-write` / `files-edit` with `workTask`), an unallowlisted review tool is not offered; through `createTaskExecute` and a scripted provider the offered tools follow the role per run (team chat, team /work, team on a community surface, undeclared with a team stamp). |
| `REQ-plugins-065` | `tests/roles.team.test.ts` ("IDENTITY-10/11: runPlugin by role") | Team `github-issue-comment` / `github-pr-review` run (dry-run) on an allowlisted repo, GITHUB-6 refuses another repo, every other mutating plugin gets the role refusal; `files-write` only with the work flag, SAFE-2 still refuses `.env`; community and undeclared refused; a demotion refuses the next call; team memory store/recall in their own scope, forget/override refused; repo gate: team reads allowlisted or public, writes allowlisted only, community writes refused, deny wins. |
| `REQ-discord-065` | `tests/roles.team.test.ts` ("IDENTITY-12 on Discord surfaces", "Discord chat stamps …", "/work and /session start by role") | `resolveDiscordActingRole` owner / team / community, muted or deny-listed team ⇒ community; the spawn env stamps role and work flag, overwriting a stale parent value, no role ⇒ community; through `startBridge` chat stamps each speaker's role and a file edit applies to the next message; `/session start` stamps the role without the work flag. |
| `REQ-discord-088` | `tests/roles.team.test.ts` ("/work and /session start by role") | A team member's `/work` runs with team + `workTask: true` and reaches the PR step; the owner's is unchanged; community and undeclared never reach it (the reply names the owner and team); a team member demoted during the run gets no PR. `tests/work.pr.test.ts` (unchanged) still passes. |
| `REQ-discord-065` / `REQ-discord-043` | `tests/roles.team.test.ts` ("ADMIN-3.b …") | `/admin people role` promotes / demotes with `admin-people-role` `started`/`ok` rows by the owner, writes `role = "team"` in the entry and keeps `[owner]` / `[github]`, reports no change for the same role, refuses the owner role, unknown roles, undeclared people, the owner's person and a missing role (`denied` rows, file unchanged), refuses a non-owner (even team, `denied` row) and a missing audit trail; `people list` shows roles; `config show` counts them; JSON keeps unread keys; the tool layer sees the new role at once. |
| `REQ-discord-043` | `tests/discord.admin-slash.test.ts` | Body shape: `people` has `list add link unlink remove role`; `role` takes `person` and `role` (choices team / community); nine commands. |
| `REQ-plugins-066` | `tests/github.public-docs.test.ts` | `publicDocPath` accepts README / STATUS / CHANGELOG and `docs/**` and refuses the rest; community reads README / STATUS / a docs file (scrubbed, untrusted), lists `docs/`, truncates past 64 KiB, refuses binary; other paths refused with exit 2 and no GitHub call (CLI too); private / unconfirmed / denied repos refused before any read; milestones mapped with `--state` / `--limit`, bad flags refused; the community catalog has the readers and never `web-fetch`. |
| `REQ-agent-065` | `tests/github.public-docs.test.ts` ("the prompt names the sources …") | The public Q&A prompt names README, docs/, STATUS, CHANGELOG and the public issues and milestones of allowed public repos, says nothing else counts, and drops "the project site, and the roadmap". |

Fail on base: with the stacked base sources swapped in (72fec65 `src/` and
`plugins/`, `plugins/github/public-docs.ts` absent), the two new files fail
to load (`resolveDiscordActingRole` / `public-docs.ts` missing) and the
`/admin` body test fails (3 fail, 29 pass). A behavioural copy that imports
only base exports (team `role` read, a team review comment via `runPlugin`,
a team catalog without `files-delete`, the readers registered, a team `/work`
reaching the PR step, `/admin people role` audited) fails 6 of 6 on base and
passes on the branch. All pass on the branch (70 across the three files and
the copy); every existing ROLES-CHAT test (`tests/roles.chat.gates.test.ts`,
`tests/github.public.community.test.ts`, `tests/search.secret-path.test.ts`,
`tests/work.pr.test.ts`, `tests/memory.plugins.test.ts`) passes unchanged.

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync
check --require-coverage 100` 100%; `hi check` green; `fledge lanes run
verify --non-interactive` completed.
