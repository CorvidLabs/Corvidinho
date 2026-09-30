# Lesson bundle — scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Scheduled runs read and act only on repos the owner allowlists, even public ones (DISCORD-SCHEDULE-3.a): in a schedule run and its delegate/council workers (CORVIDINHO_DISCORD_SESSION_ID schedule_*, SCHEDULE_SESSION_PREFIX / isScheduleRunEnv) the GitHub tools, review readers and docs/milestone readers refuse a repo off the GITHUB-6 allowlist with no visibility lookup (deny still wins, role rules still apply on top); web-fetch refuses GitHub-host URLs that do not name an allowlisted OWNER/REPO at every hop, redirects included; a schedule project that lies in a git checkout nested inside the bridge root needs an allowlisted origin at /schedule create and every tick
- **Kind**: Feature
- **Specs**: plugins, discord, cli
- **Paths**: src/plugins/roles.ts, src/plugins/githubPublic.ts, plugins/web/fetch.ts, plugins/web/commands.ts, src/worktree/manager.ts, src/discord/command-handlers/schedule.ts, src/scheduler/service.ts, tests/github.schedule-repo-gate.test.ts, tests/worktree.project-scope.test.ts, tests/scheduler.worktree.test.ts, tests/discord.session-worktree.test.ts, tests/scheduler.ask-outbox.test.ts, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/WATCH.md, specs/plugins/plugins.spec.md, specs/plugins/requirements.md, specs/plugins/testing.md, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/discord/testing.md, tests/preload.ts, tests/preload.operator-data-dir.test.ts, tests/fixtures/preload-probe.ts, specs/cli/cli.spec.md, specs/cli/requirements.md
- **Acceptance**: In tests/github.schedule-repo-gate.test.ts (no network: stubbed fetch, web-fetch resolver/transport seams): SCHEDULE_SESSION_PREFIX is schedule_ and isScheduleRunEnv is true only for a schedule_* CORVIDINHO_DISCORD_SESSION_ID (not sess_/work_/wsess_/unset); the scheduler's runChat sessionId is the prefix plus the schedule id; buildDelegateSpawn from a schedule lead (owner or community stamp, and a council voice env) keeps the marker. In a schedule env checkRepoGateForActingRole refuses a public repo off the allowlist for the community and owner stamps and for a worker env, naming DISCORD-SCHEDULE-3.a, with no visibility lookup; an allowlisted repo passes, deny still wins, a community write is still refused (ROLES-CHAT-3), a community read of an allowlisted private repo is still refused (ROLES-CHAT-8) while the owner stamp reads it; a sess_ community chat still reads a public repo. Through runPlugin github-pr-list, github-issue-list, github-pr-diff, github-pr-files, github-docs-read and github-milestone-list refuse a public off-list repo (exit 3) with zero GitHub calls, and github-pr-list in a chat still reaches it. web-fetch in a schedule env refuses (blocked, no DNS or dial) github.com / www / api /repos / codeload / raw.githubusercontent.com URLs of an off-list repo, gists, other GitHub hosts and paths naming no repo, and a denied repo; allowlisted repos and other hosts fetch; a redirect into raw.githubusercontent.com and an allowlisted GitHub URL redirecting off the list are refused on that hop after one dial; an unreadable allowlist refuses every GitHub hop; outside a schedule env the same URLs and redirect fetch; the handler refuses in a schedule env (exit 2) and fetches in a chat. In tests/worktree.project-scope.test.ts resolveProjectDir with schedule: true refuses a nested checkout inside the bridge root whose origin is off the allowlist, a folder inside it, one with no origin, one without any GitHub allowlist and a denied one, while /work scope (no option) still accepts them; an allowlisted nested checkout, the root, plain folders and a root whose own origin is off the list resolve; /schedule create refuses the off-list nested project and stores nothing, accepts the allowlisted one, and a stored tick on it fails with project resolve failed: not authorized, no agent run and no talk branch. These tests fail on the base sources and pass after; existing schedule worktree tests give their nested checkouts an allowlisted origin; no env var, config key, table, column or schema version.

## Evidence

- Verification commit: `7401bccdfae1dbca1743d7d310e418092d99f46b`
- Base commit: `dec7c31a2594673cdc3628302aef22bc05aae827`
- Verified by: `specsync check --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

DISCORD-SCHEDULE-3.a is captured on main (`hi/discord.md:40`, nested under
DISCORD-SCHEDULE-3) from Leif's 2026-09-28 interview, round 10: "Scheduled
runs read and act only on repos I allowlist, even public ones." Round 10's
note: "schedules read and act on allowlisted repos only; public
non-allowlisted repos refused". No `hi/` edits in this change.

What main did (M3/M4 synthesis, slice `schedules-owner`, part A):

- Every schedule run is stamped community (`actingIsAdmin: false`), and
  `checkRepoGateForActingRole` lets community read any repo confirmed public
  (ROLES-CHAT-8, REQ-plugins-065 / -493). So a schedule could read
  `torvalds/linux` through `github-pr-list`, the review readers or the docs
  readers. `delegate` / `council` workers inherit
  `CORVIDINHO_DISCORD_SESSION_ID` and take the same path.
- REQ-discord-202 limits a schedule's project to the bridge root, a directory
  inside it, or an allowlisted sibling checkout, but any directory inside the
  root was accepted without an origin check: a clone of a non-allowlisted repo
  placed under the root became a schedule's worktree.
- `web-fetch` is dangerous, so community schedules never get it today; once
  owner schedules get allowlisted tools (DISCORD-SCHEDULE-1.a) it could reach
  GitHub hosts.

Constraints: specs only through SpecSync; v1 off-chain; no new env var or
config key; #232 / #233 and the forget card, approvals and bridge chat paths
are other PRs' scope and are not touched. DISCORD-SCHEDULE-1.a (owner
schedules as owner) and AUTONOMY-6.a (blocking schedule asks) are later
slices that build on the marker added here.

## From the change's design.md

# Design

- `src/plugins/roles.ts`: `SCHEDULE_SESSION_PREFIX = "schedule_"` and
  `isScheduleRunEnv(env)` (`CORVIDINHO_DISCORD_SESSION_ID` starts with it).
- `src/scheduler/service.ts`: `runOne` builds `sessionId` from the constant
  and passes `schedule: true` to `resolveProjectDir`. Start-up recovery does
  not pass it, so leftover worktrees of runs on a now-refused project are
  still parked.
- `src/plugins/githubPublic.ts` `checkRepoGateForActingRole`: after the deny
  lists, in a schedule env, `checkGithubRepo` must pass (error names
  DISCORD-SCHEDULE-3.a); no visibility lookup is made for a refused repo. The
  existing role branches then run unchanged.
- `plugins/web/fetch.ts`: `WebFetchDeps` gains `env` and `allowlist`
  seams; `githubRepoOfUrl(url)`; `scheduleRepoGate` reads the allowlist once
  per call (`tryLoadAllowlist`) in a schedule env; `run`'s `checkHop`
  (shape check + gate) is applied to the first URL and every redirect before
  DNS. `plugins/web/commands.ts` passes `deps.env ?? process.env` and adds a
  line to the tool description.
- `src/worktree/manager.ts`: `ResolveProjectOptions.schedule`;
  `nestedCheckoutError` (the dir's `--show-toplevel` inside the root and not
  the root ⇒ that checkout's origin must pass `isRepoAllowed`).
- `src/discord/command-handlers/schedule.ts`: `/schedule create` passes
  `schedule: true`.
- No env var, config key, command, table, column or schema version.

Design choices pending Leif:

1. **Role rules stay on top in a scheduled run.** The synthesis said
   "allowlist only, no visibility lookup". Here a repo off the allowlist is
   refused with no lookup (that part is as planned), but an allowlisted repo
   still goes through the role rules, so a community-stamped schedule run
   still needs a public repo for reads (ROLES-CHAT-8) and its writes stay
   refused (ROLES-CHAT-3). The schedule rule only ever narrows. Today every
   schedule is community-stamped, so an owner's schedule still cannot read an
   allowlisted private repo until DISCORD-SCHEDULE-1.a stamps owner schedules
   as owner. Alternative: allowlist only for every role in a scheduled run.
2. **Which GitHub hosts web-fetch gates.** `github.com`,
   `githubusercontent.com` and every subdomain of either. Only five
   host/path shapes name a repo; gists, release-asset and LFS objects,
   avatars, `docs.github.com`, profile / search / `/orgs` pages and API
   routes other than `/repos/` are refused in a scheduled run. GitHub Pages
   (`*.github.io`) and other mirrors are not gated. Alternative: gate only the
   named hosts, or let gists and release assets of allowlisted owners through.
3. **Nested checkouts.** Any directory in a checkout nested inside the bridge
   root counts (not only its top), and a nested checkout with no origin is
   refused. The bridge root's own checkout is unchanged even when its origin
   is off the allowlist, as are plain folders.
4. **Existing schedules** on such a checkout are not paused or migrated: they
   fail at their next tick through the REQ-discord-353 stuck ask (auto-pause
   after five), with an upgrade note in the docs.
5. **Refusal text.** GitHub tools append "scheduled runs use allowlisted
   repos only, even public ones (DISCORD-SCHEDULE-3.a)"; web-fetch names only
   the host, never the path (a redirect path is server-chosen).

## From the change's testing.md

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

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`
- `specs/cli/context.md`
