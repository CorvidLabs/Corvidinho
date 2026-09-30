---
id: scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
state: draft
type: feature
base_commit: dec7c31a2594673cdc3628302aef22bc05aae827
---

# Scheduled runs read and act only on repos the owner allowlists, even public ones (DISCORD-SCHEDULE-3.a): in a schedule run and its delegate/council workers (CORVIDINHO_DISCORD_SESSION_ID schedule_*, SCHEDULE_SESSION_PREFIX / isScheduleRunEnv) the GitHub tools, review readers and docs/milestone readers refuse a repo off the GITHUB-6 allowlist with no visibility lookup (deny still wins, role rules still apply on top); web-fetch refuses GitHub-host URLs that do not name an allowlisted OWNER/REPO at every hop, redirects included; a schedule project that lies in a git checkout nested inside the bridge root needs an allowlisted origin at /schedule create and every tick

## Intent

Scheduled runs read and act only on repos the owner allowlists, even public ones (DISCORD-SCHEDULE-3.a): in a schedule run and its delegate/council workers (CORVIDINHO_DISCORD_SESSION_ID schedule_*, SCHEDULE_SESSION_PREFIX / isScheduleRunEnv) the GitHub tools, review readers and docs/milestone readers refuse a repo off the GITHUB-6 allowlist with no visibility lookup (deny still wins, role rules still apply on top); web-fetch refuses GitHub-host URLs that do not name an allowlisted OWNER/REPO at every hop, redirects included; a schedule project that lies in a git checkout nested inside the bridge root needs an allowlisted origin at /schedule create and every tick

## Affected Canonical Specs

- `plugins`
- `discord`

## Acceptance Criteria

- In tests/github.schedule-repo-gate.test.ts (no network: stubbed fetch, web-fetch resolver/transport seams): SCHEDULE_SESSION_PREFIX is schedule_ and isScheduleRunEnv is true only for a schedule_* CORVIDINHO_DISCORD_SESSION_ID (not sess_/work_/wsess_/unset); the scheduler's runChat sessionId is the prefix plus the schedule id; buildDelegateSpawn from a schedule lead (owner or community stamp, and a council voice env) keeps the marker. In a schedule env checkRepoGateForActingRole refuses a public repo off the allowlist for the community and owner stamps and for a worker env, naming DISCORD-SCHEDULE-3.a, with no visibility lookup; an allowlisted repo passes, deny still wins, a community write is still refused (ROLES-CHAT-3), a community read of an allowlisted private repo is still refused (ROLES-CHAT-8) while the owner stamp reads it; a sess_ community chat still reads a public repo. Through runPlugin github-pr-list, github-issue-list, github-pr-diff, github-pr-files, github-docs-read and github-milestone-list refuse a public off-list repo (exit 3) with zero GitHub calls, and github-pr-list in a chat still reaches it. web-fetch in a schedule env refuses (blocked, no DNS or dial) github.com / www / api /repos / codeload / raw.githubusercontent.com URLs of an off-list repo, gists, other GitHub hosts and paths naming no repo, and a denied repo; allowlisted repos and other hosts fetch; a redirect into raw.githubusercontent.com and an allowlisted GitHub URL redirecting off the list are refused on that hop after one dial; an unreadable allowlist refuses every GitHub hop; outside a schedule env the same URLs and redirect fetch; the handler refuses in a schedule env (exit 2) and fetches in a chat. In tests/worktree.project-scope.test.ts resolveProjectDir with schedule: true refuses a nested checkout inside the bridge root whose origin is off the allowlist, a folder inside it, one with no origin, one without any GitHub allowlist and a denied one, while /work scope (no option) still accepts them; an allowlisted nested checkout, the root, plain folders and a root whose own origin is off the list resolve; /schedule create refuses the off-list nested project and stores nothing, accepts the allowlisted one, and a stored tick on it fails with project resolve failed: not authorized, no agent run and no talk branch. These tests fail on the base sources and pass after; existing schedule worktree tests give their nested checkouts an allowlisted origin; no env var, config key, table, column or schema version.

## No-spec Rationale

Not applicable
