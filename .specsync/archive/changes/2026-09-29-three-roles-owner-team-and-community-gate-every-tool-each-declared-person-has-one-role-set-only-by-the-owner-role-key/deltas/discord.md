---
module: discord
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
---

# Delta — discord (roles on Discord surfaces; /admin people role)

## Added

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

Acceptance Criteria
- `role = "team"` / `"community"` (any case, TOML and JSON) resolve; no role, undeclared ⇒ community; the owner ⇒ owner; `role = "owner"` elsewhere ⇒ community with a problem; a list or unknown value skips the entry.
- `resolveDiscordActingRole` gives owner, team and community, and community for a muted or deny-listed team member.
- The spawn env carries `CORVIDINHO_ACTING_ROLE` owner / team / community and `CORVIDINHO_ACTING_WORK_TASK`, overwriting a stale parent value; no role passed ⇒ community.
- Through `startBridge`, chat stamps each speaker's role and a file edit applies to the next message; `/work` stamps team + the work flag for a team member and reaches the PR step; `/session start` stamps the role without the work flag.
- `/admin people role` promotes and demotes with `admin-people-role` `started`/`ok` rows and a no-change reply for the same role; it refuses the owner role, unknown roles, undeclared people, the owner's person and a missing role (`denied`, file unchanged), a non-owner, and a missing audit trail; JSON files keep unread keys; `people list` shows roles and `config show` counts them.
- Regression tests in `tests/roles.team.test.ts` and `tests/discord.admin-slash.test.ts` fail on the base sources and pass after.

## Modified

### REQUIREMENT REQ-discord-043


The bridge SHALL register one owner-only `/admin` slash command with
subcommand groups `users add` (ADMIN-1), `channels add|remove` (ADMIN-2),
`config show` (ADMIN-3) and `people list|add|link|unlink|remove` (ADMIN-3.a,
REQ-discord-036) plus `people role` (ADMIN-3.b, REQ-discord-065). The dispatcher SHALL require ADMIN and the handler
SHALL re-check ADMIN before doing anything else (ADMIN-4 / DISCORD-7); with
no owner nobody can run it (IDENTITY-2/3).

The `users` / `channels` mutations SHALL edit only `[discord].users` / `[discord].channels` in the
allowlist file the bridge already reads (the loaded file, else
`CORVIDINHO_ALLOWLIST_FILE`, else `~/.config/corvidinho/allowlist.toml`,
created 0600 when missing), written atomically (temp file in the same
directory, fsync, rename; mode kept) with every other line, section and
comment kept. The file SHALL be read and written as JSON exactly when the
allowlist loader reads it as JSON (one shared rule, `isJsonAllowlistPath`: a
case-sensitive `.json` suffix), else as TOML, so an edit always matches what
the next load reads. When that path is a symlink whose target does not
resolve (dangling or looping), the mutation, the atomic write and
`config show` SHALL refuse with a clear error, and the link SHALL NOT be
replaced by a regular file. The live allowlist SHALL be recomputed as file ∪
env and updated in place so it applies without a restart. Env values SHALL
NOT be written to the file or changed at runtime; the reply SHALL say so.

Empty SHALL stay deny-all: adding a deny-listed id SHALL be refused, and
removing an env-only channel SHALL be refused, as SHALL removing a channel
when no live channel that is not also on `deny_channels` would remain (deny
always wins, so only deny-listed channels left is the same lockout). When
the first user is added while users and roles were both empty, the reply
SHALL warn that unlisted callers now resolve to BLOCKED. Replies SHALL be
ephemeral, show before/after counts and never contain tokens or secrets.
`config show` SHALL list live/file/env counts, owner configured yes/no plus
display, the number of declared people (and of problems in their entries)
and of team and community roles among them, and which knobs are updatable
(declared people and their roles included). Each mutation SHALL append SAFE-5
audit rows (`started` before the write, then `ok`/`error`); refusals SHALL
append `denied`. A mutation SHALL fail closed with the same
`audit log unavailable (SAFE-5)` refusal, writing nothing, both when the
trail throws and when no trail is wired (a bridge without a DB); it SHALL
never write an unaudited change. The gateway SHALL flatten subcommand-group
options.

Acceptance Criteria
- Non-owner and no-owner callers get ephemeral `not authorized` at dispatch and at the handler; the file is not written.
- `/admin users add` writes only the users line, keeps `[owner]`/`[github]`/comments, updates the live list in place, and warns on the first user.
- `/admin channels add` makes a new channel pass the slash gate without restart; `remove` drops it; env-only and last-channel removals are refused, and so is a removal that would leave only deny-listed channels.
- Deny-listed ids are refused; unreadable/unparsable files are refused untouched; JSON with lossy numeric ids is refused.
- `/admin config show` shows counts by source and updatable knobs, and no token, key or owner id.
- Mutations append `started` + `ok` audit rows with an args digest only; an unavailable audit trail refuses the change.
- With no audit trail wired (`recordAudit` unset), `users add` and `channels add` reply `audit log unavailable (SAFE-5)`, and the file and live lists are unchanged; `config show` still works.
- `allowlist.JSON` (TOML text) is edited as TOML, matching the loader, and reloads with the new entry; `allowlistFileFormat` agrees with `isJsonAllowlistPath` for every path.
- A dangling or looping symlink at the allowlist path is refused by `/admin`, `writeFileAtomic` and `config show`; the link stays a symlink and its target is not created.
- Fixture tests only; no live Discord token or network.
- `/admin config show` shows the declared-people count with the problem count and names `/admin people add|link|unlink|remove` among the updatable knobs.
- The `/admin` body has the groups `users`, `channels`, `config` and `people` (`list`, `add`, `link`, `unlink`, `remove`, `role`), still nine top-level commands; `role` takes `person` and `role` with the choices `team` / `community`.
- `/admin config show` counts team and community roles among the declared people and names `/admin people role` among the updatable knobs.

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
run, REQ-discord-065); community /work runs keep the changes on the work
branch (ROLES-CHAT-3).

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
- A /work by anyone other than ADMIN (the owner) or a declared team member (IDENTITY-10, re-resolved from the people list after the run) never runs the PR step (ROLES-CHAT-3); the reply says the changes stay on the work branch.
- A team member's /work reaches the PR step with the same gates as the owner's; a team member demoted during the run does not.
- Nothing is committed or pushed unless the worktree HEAD is the work branch and not the base; a switched or detached HEAD opens no PR.
