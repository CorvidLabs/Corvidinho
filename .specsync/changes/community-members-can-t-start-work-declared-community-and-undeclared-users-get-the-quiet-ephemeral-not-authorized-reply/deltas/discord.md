---
module: discord
change: community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply
---

# Delta — discord (community members can't start /work, IDENTITY-11.a)

## Modified

### REQUIREMENT REQ-discord-065

Roles on Discord (IDENTITY-8..12, ADMIN-3.b, #65). Each declared person
(REQ-discord-036) SHALL have exactly one role, read from `role = "team"` or
`role = "community"` in their `[people.<id>]` entry (JSON `role`), any case;
no `role` key reads as community; the configured owner's person is always
owner; `role = "owner"` on anyone else grants nothing (community, reported as
a problem naming the person id, never an account id); a list, an empty or an
unknown value makes the entry unreadable (skipped whole, fail closed).
`resolvePerson` returns `role` (`owner`, or the declared team / community) and
`roleOfPerson` the effective role (community for no role and for anyone
undeclared). `resolveDiscordActingRole` (`permissions.ts`) SHALL give a
Discord run's spawn role: `owner` when the caller resolves to ADMIN, `team`
when the owner's people list declares the caller's Discord id team and the
caller is not BLOCKED (muted / deny-listed), else `community`. The bridge
(chat and button-pick resume), `/session start` and `/work` SHALL pass it as
`AgentRunChatOpts.actingRole` (with `actingIsAdmin` = owner) and `/work` also
`workTask: true`; the spawn client SHALL always overwrite
`CORVIDINHO_ACTING_ROLE` (`owner` when `actingIsAdmin`, `team` only when the
caller passed team, else `community` — schedules pass none) and
`CORVIDINHO_ACTING_WORK_TASK` (`1` / `0`), never inheriting them. The tool
layer re-resolves the role on every call (REQ-plugins-065). `/admin people
role person:<id> role:<team|community>` (ADMIN-3.b) SHALL be the only chat
surface that sets a role: owner-only (dispatcher floor + handler re-check),
SAFE-5 `admin-people-role` rows (`started` before the atomic write, then
`ok`; `denied` for refusals; fail closed without a trail), writing only that
person's `role` key through the `/admin people` writer and its re-read safety
net; it SHALL refuse the owner role (owner is `[owner]` / env, IDENTITY-1),
an unknown role, an undeclared person and the owner's own person, and report
no change for the same role. `/admin people list` shows each person's role;
`config show` counts team and community. No chat or plugin path sets a role
(IDENTITY-8).

`/work` SHALL start only for the owner or a declared team member
(IDENTITY-11.a): the handler resolves the caller's role with
`resolveDiscordActingRole` from the live owner config and the people list
re-read at the time of the command (`loadDeclaredPeople`), after the SAFE-13
inbound check (REQ-discord-071), and for community — declared community, a
declared person with no role, anyone undeclared (IDENTITY-12), a muted or
deny-listed caller, and everyone when no owner is configured (IDENTITY-3) — it
SHALL reply only with the ephemeral `not authorized` (`NOT_AUTHORIZED`, the
reply the owner-only `/announce channel`, `/schedule create` and `/admin`
give a non-owner) and return before it defers a public reply, creates a
session, a git worktree or `talk/*` branch, a work task, an agent run (so no
verify lane) or the PR step. The owner's and a team member's `/work` are
unchanged. `/session start` and chat stay open to community (read tools only,
ROLES-CHAT-2). No new env var, config key, slash command, option or schema
change.

Acceptance Criteria
- `role = "team"` / `"community"` (any case, TOML and JSON) resolve; no role, undeclared ⇒ community; the owner ⇒ owner; `role = "owner"` elsewhere ⇒ community with a problem; a list or unknown value skips the entry.
- `resolveDiscordActingRole` gives owner, team and community, and community for a muted or deny-listed team member.
- The spawn env carries `CORVIDINHO_ACTING_ROLE` owner / team / community and `CORVIDINHO_ACTING_WORK_TASK`, overwriting a stale parent value; no role passed ⇒ community.
- Through `startBridge`, chat stamps each speaker's role and a file edit applies to the next message; `/work` stamps team + the work flag for a team member and reaches the PR step; `/session start` stamps the role without the work flag.
- `/admin people role` promotes and demotes with `admin-people-role` `started`/`ok` rows and a no-change reply for the same role; it refuses the owner role, unknown roles, undeclared people, the owner's person and a missing role (`denied`, file unchanged), a non-owner, and a missing audit trail; JSON files keep unread keys; `people list` shows roles and `config show` counts them.
- Regression tests in `tests/roles.team.test.ts` and `tests/discord.admin-slash.test.ts` fail on the base sources and pass after.
- IDENTITY-11.a: a `/work` by declared community, a declared person with no role, or an undeclared user (also with a `project` option, and with no owner configured), and by a muted or deny-listed team member, gets exactly one ephemeral `not authorized` reply and no deferred reply; no session, work task, agent run or PR step; the project repo gains no worktree or `talk/*` branch; through `handleSlashInteraction` and through `startBridge` alike.
- A role change in the people file applies to the next `/work` without a restart: a demoted team member is refused, a promoted community member runs as team with the work flag.
- The owner's and a team member's `/work` run unchanged (a worktree under the worktree base, `workTask: true`, the PR step); a community `/work` description that trips SAFE-13 still gets the SAFE-13 refusal and the owner ping.
- Regression tests in `tests/roles.community-no-work.test.ts` fail on the base sources and pass after; the community cases in `tests/roles.team.test.ts`, `tests/work.pr.test.ts` and `tests/discord.actor-gate.test.ts` now expect the refusal.

### REQUIREMENT REQ-discord-088

After a `/work` run finishes, the handler SHALL try to ship the run's active
git worktree as a **draft** pull request (AUTONOMOUS-3 / GITHUB-2) and SHALL
add exactly one `PR:` line to its reply, above the run summary. A PR SHALL be
opened only when all of these hold, checked before any commit or push:

- the run finished cleanly and its result frame does not report a failed
  verify (AGENT-4);
- the work ran in an active git worktree with a branch, and that worktree has
  uncommitted changes or commits ahead of the merge-base with the remote
  default branch (`refs/remotes/origin/HEAD`, else `main`), with no conflicts;
- `git-push` and `github-pr-create` — plus `git-commit` when the tree is
  dirty — are in the non-interactive plugin allowlist (GITHUB-5 / SAFE-1);
- the push remote's OWNER/REPO passes the GitHub repo gate (GITHUB-6);
- the tree passed `fledge lanes run verify --non-interactive`: taken from the
  run's result frame when it reports `verified`, else run once in the worktree
  before anything is pushed (AGENT-4).

The PR step SHALL run only for the owner (ADMIN) or a declared team member
(IDENTITY-10; the role is re-resolved from the live people list after the
run, REQ-discord-065). Community never starts `/work` (IDENTITY-11.a,
REQ-discord-065), so it never reaches this step; a team member demoted to
community during the run keeps the changes on the work branch
(ROLES-CHAT-3).

The steps SHALL run through the existing typed plugins with
`nonInteractive: true` — `git-commit` (explicit paths from `git status`),
`git-push`, then `github-pr-create --draft --head <talk branch> --base
<default branch>` — so SAFE-1 denial and SAFE-5 audit apply. The PR body
SHALL be built from the real diff against the merge-base (name-status file
list, diffstat, commit subjects) plus the verify result, with repo, model and
chat text inside code fences, and title, body and commit message SHALL be
secret-scrubbed (SAFE-6). The Discord spawn client SHALL pass the result
frame's `verified` / `verifySkipped` / `state` through as
`AgentSpawnResult.task`. When a gate fails or a step errors, the `PR:` line
SHALL say plainly why and SHALL NOT claim a PR. No new slash command, option,
env var, table or column.

Acceptance Criteria
- A dirty verified worktree with the three plugins allowlisted is committed, pushed and opened as a draft PR whose body lists the changed files, diffstat, commits and verify result.
- Missing allowlist entries are named in the reply and nothing is committed, pushed or verified.
- A failed run, failed verify, scoped (non-git) dir, clean tree, conflicts or repo-gate refusal opens no PR and says why in one line.
- An unverified run triggers one verify-lane run in the worktree before push; a failing lane ships nothing.
- Push or PR-create failure yields a plain line and never a claimed PR.
- Fixture tests use temp repos, a local bare remote, the dry-run github plugin and a mocked verify lane.
- A /work by anyone other than ADMIN (the owner) or a declared team member (IDENTITY-10, re-resolved from the people list after the run) never runs the PR step (ROLES-CHAT-3): a community /work never runs at all (IDENTITY-11.a; the reply is the ephemeral `not authorized`), and a team member demoted during the run gets a reply that says the changes stay on the work branch.
- A team member's /work reaches the PR step with the same gates as the owner's; a team member demoted during the run does not.
- Nothing is committed or pushed unless the worktree HEAD is the work branch and not the base; a switched or detached HEAD opens no PR.
