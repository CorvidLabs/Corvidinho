---
change: scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
artifact: testing
---

# Testing

New tests — `tests/github.schedule-repo-gate.test.ts` (17; stubbed `fetch`
for GitHub, resolver / transport seams for `web-fetch`, an allowlist file
with `orgs = ["CorvidLabs"]` and `deny_repos = ["CorvidLabs/secret"]`; no
token, no network; the new exports are read through a namespace import so
the base sources fail on behaviour, not on import):

- Marker: prefix `schedule_`; `isScheduleRunEnv` only for `schedule_*`; the
  scheduler's session id; `buildDelegateSpawn` (owner and community leads,
  council voice env) keeps the marker.
- Gate: a public off-list repo refused for the community and owner stamps
  and a worker env, no visibility lookup; allowlisted passes; deny wins;
  community write (ROLES-CHAT-3) and community private read (ROLES-CHAT-8)
  still refused, owner reads the private allowlisted repo; a `sess_*`
  community chat still reads the public repo.
- Plugins: six GitHub readers refuse the public off-list repo with exit 3 and
  zero GitHub requests; `github-pr-list` in a chat reaches it.
- `web-fetch`: off-list / no-repo / denied GitHub URLs refused before DNS;
  allowlisted repos and other hosts fetch; a redirect into
  `raw.githubusercontent.com` and an allowlisted URL redirecting off the list
  refused on that hop; unreadable allowlist refuses GitHub hops only; outside
  a schedule env everything fetches; the handler exits 2 in a schedule env.

`tests/worktree.project-scope.test.ts` (3 new): `resolveProjectDir` with
`schedule: true` refuses an off-list nested checkout, a folder in it, one
with no origin, one with no allowlist and a denied one (`/work` scope still
accepts them); an allowlisted nested checkout, the root, plain folders and an
off-list root still resolve; `/schedule create` refuses and stores nothing,
accepts the allowlisted one; a stored tick fails `project resolve failed: …
not authorized` with no agent run and no talk branch.

Updated: `tests/scheduler.worktree.test.ts`,
`tests/discord.session-worktree.test.ts` and `tests/scheduler.ask-outbox.test.ts`
give their nested schedule checkouts an allowlisted origin.

Fail-on-base proof: with `src/plugins/roles.ts`, `src/plugins/githubPublic.ts`,
`plugins/web/fetch.ts`, `plugins/web/commands.ts`, `src/worktree/manager.ts`,
`src/discord/command-handlers/schedule.ts` and `src/scheduler/service.ts`
from `origin/main` (dec7c31) swapped in, 13 of the 20 new tests fail (11 of
17 in the new file: marker, gate and plugin refusals, web-fetch refusals; 2 of
3 nested-checkout cases); the guards (allowlisted, deny, role rules, outside a
schedule, still-resolves) pass on both. With the branch sources restored all
pass; full `bun test` 2694 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-496` | `tests/github.schedule-repo-gate.test.ts` | Marker and inheritance; schedule-env gate refusals with no lookup for owner, community and worker; allowlisted / deny / role rules; six readers exit 3 with no request; web-fetch direct and redirect refusals, allowlisted and other hosts fetch, unreadable allowlist, outside a schedule unchanged, handler exit 2. Fails on base. |
| `REQ-plugins-065` | `tests/github.schedule-repo-gate.test.ts`, `tests/roles.team.test.ts` | Schedule step before the role rules; role rules still apply (community write / private read refused, owner reads); existing team tests unchanged. |
| `REQ-plugins-493` | `tests/github.schedule-repo-gate.test.ts`, `tests/github.public.community.test.ts` | Public off-list repo refused in a schedule env with no visibility request; `sess_*` chat keeps the public path; existing ROLES-CHAT-8 tests unchanged. |
| `REQ-plugins-111` | `tests/github.schedule-repo-gate.test.ts`, `tests/web.fetch.test.ts` | Per-hop GitHub rule on the first hop and on redirects in a schedule env; SAFE-7 suite unchanged. |
| `REQ-discord-202` | `tests/worktree.project-scope.test.ts` | Nested off-list / no-origin / denied checkout refused for a schedule at create and tick, `/work` unchanged, allowlisted nested checkout and root resolve. Fails on base. |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` | A child `bun test` started with a `schedule_*` `CORVIDINHO_DISCORD_SESSION_ID` (as a scheduled run's verify lane) does not see it. Fails without the preload line; without it the full suite run under that key fails 13 ROLES-CHAT-8 / team gate tests. |
