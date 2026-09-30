---
module: plugins
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
---

# Delta: plugins (a scheduled run is the owner's own or community, never team, DISCORD-SCHEDULE-1.a)

## Modified

### REQUIREMENT REQ-plugins-065

The plugin layer SHALL gate every mutating plugin by the acting role —
owner, team or community (IDENTITY-8..12, #65) — resolved at every call by
`resolveActingRole(env)` (`src/plugins/roles.ts`), never from the prompt:
`null` outside a role session (`CORVIDINHO_ACTING_IS_ADMIN` unset: local CLI,
no role gate); `owner` when the ADMIN re-check passes (`resolveActingIsAdmin`:
bridge bit + configured owner, not muted or deny-listed — IDENTITY-9, as
ROLES-CHAT-4); `team` only when the spawning surface allows it
(`CORVIDINHO_ACTING_ROLE` is `team`, or `owner` for a caller no longer the
owner; with no stamp the ADMIN bit alone caps at owner, `actingRoleCap`) AND
the acting Discord user id, matched in the owner's people list re-read now
(`loadDeclaredPeople` + `resolvePerson`, stable ids only), is a person whose
role is team, not muted (`DISCORD_MUTED_USER_IDS`) and not on
`[discord].deny_users`; else `community` — undeclared, declared community or
without a role, WATCH / schedules other people create / workers (community
stamp or no actor), and any read failure. A stamp never raises the role. In a
scheduled run (`isScheduleRunEnv`: `CORVIDINHO_DISCORD_SESSION_ID` starts
with `schedule_`) `resolveActingRole` SHALL return `owner` only through the
ADMIN re-check above (the scheduler stamps the ADMIN bit only for the live
owner's own schedule, DISCORD-SCHEDULE-1.a) and otherwise `community`, never
`team`, whatever `CORVIDINHO_ACTING_ROLE` says, so schedules other people
create stay read-only. `roleAllowsPlugin(role, cmd,
workTask)` SHALL be the one rule: read plugins for every role; mutating
plugins (`isMutatingPlugin`) for the owner and `null`; for team only
`TEAM_REVIEW_TOOLS` (`github-issue-comment`, `github-pr-review`) plus, when
`CORVIDINHO_ACTING_WORK_TASK` is truthy (a `/work` run), `TEAM_WORK_TOOLS`
(`files-write`, `files-edit`); for community none (IDENTITY-10/11).
`runPlugin` SHALL refuse a mutating plugin the role does not allow with the
existing `Denied: plugin "<name>" is not allowed for your role
(ROLES-CHAT-3).` (exit 2) before SAFE-1, the audit row or the handler; SAFE-1,
SAFE-2, SAFE-5 and the memory ACL (forget / override stay owner-only,
REQ-plugins-011) still apply to whatever the role allows. A team review is
feedback: `github-pr-review` SHALL refuse `--event APPROVE` and
`REQUEST_CHANGES` with the role refusal (exit 2, naming IDENTITY-10) unless
the role, re-resolved at that call, is owner or there is no role session, so
a team member never gets an approval that counts toward, or a review that
blocks, a merge. In a team `/work` run `files-write` and `files-edit` SHALL
refuse a secret-looking path (`isSecretPath`, as named or as resolved; exit
2, ROLES-CHAT-8) like the read tools, so an edit is never a read oracle for a
secret file; the owner and the local CLI keep it.
`checkRepoGateForActingRole(repo, { write })` SHALL keep deny lists first,
then: team reads pass on a GITHUB-6-allowlisted repo or a confirmed-public one;
team writes (`write: true`, passed by `github-issue-create`,
`github-issue-comment`, `github-pr-create`, `github-pr-review`) pass only on an
allowlisted repo; community reads keep the confirmed-public path
(ROLES-CHAT-8) and community writes are refused; owner and `null` keep the
GITHUB-6 allowlist. Secret-path hiding (REQ-plugins-267) keeps treating team
like community. No new table, column or schema version; the two env keys are
internal, set only by the Discord spawn client.
In a scheduled run (`isScheduleRunEnv`, REQ-plugins-496)
`checkRepoGateForActingRole` SHALL first refuse, after the deny lists, a repo
off the GITHUB-6 allowlist for every role with no visibility lookup
(DISCORD-SCHEDULE-3.a); the role rules above then apply unchanged to what
passes.

Acceptance Criteria
- A `role = "team"` person with a team stamp resolves team; the same person with a community stamp, no stamp, muted, deny-listed or demoted in the file resolves community at the next call; an owner stamp for a team person resolves team; undeclared, declared-community and no-role people resolve community even with a team stamp; the owner with the bridge bit resolves owner; no role session resolves null; an unreadable allowlist file resolves community.
- `roleAllowsPlugin` allows every read plugin for every role, every plugin for owner and null, only the review tools (plus the work tools with the work flag) of the mutating plugins for team, none for community.
- As team, `github-issue-comment` and `github-pr-review` run (dry-run) on an allowlisted repo and a non-allowlisted repo gets GITHUB-6; every other mutating plugin gets the role refusal; `files-write` runs only with the work flag and SAFE-2 still refuses `.env`; memory store/recall stay in the actor's scope, forget/override are refused.
- As team, `github-pr-review --event COMMENT` runs and `APPROVE` / `REQUEST_CHANGES` (any case) get the role refusal naming IDENTITY-10; the owner runs all three events.
- In a team `/work` run `files-write` refuses `credentials.json`, `id_rsa`, `*.pem` and `.ssh/…`, and `files-edit` on a secret file refuses without saying whether the old string matched, leaving the file unchanged; the owner edits it.
- Team reads pass on an allowlisted or confirmed-public repo and are refused on a private non-allowlisted one; team writes on a public non-allowlisted repo are refused; community writes are refused; deny lists win.
- Every existing ROLES-CHAT test passes unchanged; regression tests in `tests/roles.team.test.ts` fail on the base sources and pass after.
- In a scheduled run a public repo off the allowlist is refused for every role before any visibility lookup, and the role rules still apply to an allowlisted one (`tests/github.schedule-repo-gate.test.ts`).
- In a scheduled run the owner stamp for the owner resolves `owner`, runs `github-issue-comment` (dry run) and `files-write`, and is offered its allowlisted owner tools but not `shell-exec`; a team member's scheduled run with a community, team or owner stamp resolves `community`, gets the role refusal for `github-issue-comment` and is offered no mutating tool; the same team stamp outside a schedule still resolves `team` (`tests/roles.team.test.ts`, failing on the base sources).

### REQUIREMENT REQ-plugins-101

Memory plugins by person and project, private to the person and the owner
(MEMORY-5..7, MEMORY-ACL-6, #101). Whose memory a call reads and writes SHALL
be the acting Discord id (bridge env only, REQ-plugins-011) matched in the
owner's people list re-read at the call (`loadPeopleForMemory`,
`memorySubjectFor`): a declared person's `person:<id>` profile (reading
also the rows under their linked Discord ids from before they were
declared), else the Discord id as before (MEMORY-ACL-1). `memory-store`
SHALL accept the profile categories `project`, `preference`,
`decision`, `ask`, `approval` (MEMORY-5) and `private` (MEMORY-7), and
SHALL refuse `--person` (it writes only the acting person's own memory).
`memory-profile` (safe, minTier 0) SHALL show the subject's role from the
people list (IDENTITY-8; never from memory), projects, preferences, a history
of decisions, asks and approvals newest first, and counts of private and
other notes — never private note content.

`memory-recall` / `memory-profile` SHALL read someone else's memory only
with `--person <declared id | Discord id | mention>` when the handler-time
ADMIN re-check passes (the owner with the bridge bit, not muted or
deny-listed); anyone else naming anyone but themselves SHALL get the opaque
`not authorized` whether or not that person exists (MEMORY-7 /
MEMORY-ACL-2). A recall SHALL leave private notes out unless `--category
private` is asked for, and then SHALL return them only in a conversation
(`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` set by the bridge; never a schedule
or other run), labelled for that person and the owner only.

`--project` on `memory-store` / `memory-recall` SHALL use the run's
project scope (`projectScopeFor(cwd)`, REQ-discord-101) and SHALL be allowed
only when `resolveActingRole` is owner, team or null (the local CLI);
community (undeclared, declared community, WATCH, schedules other people
create, workers; the owner's own schedule resolves owner,
DISCORD-SCHEDULE-1.a) SHALL get the role refusal (exit 2); a project
SHALL have no private notes, and `--project` SHALL NOT combine with
`--person`.

`memory-forget-me` (safe, minTier 0, not mutating, so every role may call
it) SHALL take no arguments and record a forget request for the acting
subject (`ForgetRequestStore.request`, one pending per subject; a repeat
returns the open one) with the conversation it came from; it SHALL refuse
with no acting user, outside a conversation, and when no owner is configured
(IDENTITY-3); it SHALL write SAFE-5 `memory-forget-request` rows (`started`
first, refusing when that cannot be written, then `ok` / `error`) and SHALL
delete nothing: forgetting happens only on the owner's Approve
(REQ-discord-101). `memory-forget` / `memory-override` (owner, two-phase)
are unchanged.

Acceptance Criteria
- A declared person's `memory-store` lands in `person:<id>` and every linked Discord id recalls it; rows under their Discord ids from before are read once; an undeclared user's scope is their Discord id.
- `memory-profile` shows the people list's role (a file edit changes it), projects, preferences, history newest first and a private-note count without content.
- A non-owner's `--person` (any ref, known or not) and `memory-profile --person` get `not authorized`; the owner with the bridge bit reads a person's memory and private notes; without the bit or muted, refused.
- Private notes are left out of default and query recalls, returned on `--category private` for that person or the owner in a conversation, refused in a schedule run; `memory-store --person` is refused.
- `--project` works for owner, team and the local CLI and is refused for community, undeclared and a community-stamped team member; `--project --category private` and `--project --person` are refused.
- `memory-forget-me` records one pending ask per person (audited), deletes nothing, and refuses with no actor, outside a conversation, with arguments, and with no owner.
- `tests/memory.profiles.test.ts` and `tests/discord.forget-card.test.ts` cover each and fail on the stacked base sources.
- In the owner's own scheduled run (owner stamp, `schedule_*` session, no reply channel) `memory-store --project` and `memory-recall --project` work, while `memory-recall --category private`, `memory-recall --person <id>` and `memory-profile` are refused with no private place to show them and no `privateText` (`tests/scheduler.owner-role.test.ts`).
