---
module: plugins
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
---

# Delta: plugins (the tool layer resolves a GitHub run's role from the trigger's numeric id — IDENTITY-12.a)

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
without a role, schedules / workers (community stamp or no actor), WATCH runs
no declared owner or team member triggered, and any read failure. A stamp never raises the role. `roleAllowsPlugin(role, cmd,
workTask)` SHALL be the one rule: read plugins for every role; mutating
plugins (`isMutatingPlugin`) for the owner and `null`; for team only
`TEAM_REVIEW_TOOLS` (`github-issue-comment`, `github-pr-review`) and
`TEAM_SEARCH_TOOLS` (`web-search` and `gif-search`, PLUGIN-9: "Web search and
GIF search are for me and the team only, and stay off until I allow them,
like web-fetch"; on every team session, still SAFE-1 allowlisted and SAFE-5
audited; `web-fetch` and `discord-send-file` stay the owner's) plus, when
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
internal, set only by the Discord and WATCH spawn clients.
In a scheduled run (`isScheduleRunEnv`, REQ-plugins-496)
`checkRepoGateForActingRole` SHALL first refuse, after the deny lists, a repo
off the GITHUB-6 allowlist for every role with no visibility lookup
(DISCORD-SCHEDULE-3.a); the role rules above then apply unchanged to what
passes.


- On GitHub (IDENTITY-12.a, REQ-plugins-1201) a WATCH run (surface stamp
  `watch`) SHALL resolve owner and team from the GitHub numeric id the WATCH
  spawn stamps for the person who triggered it, never from a Discord id, with
  the same rules otherwise: the stamp only lowers the role, and anyone else
  is community.
- A WATCH run SHALL never be a `/work` task: `actingWorkTask` is false there
  whatever `CORVIDINHO_ACTING_WORK_TASK` says, so team never gets the work
  tools on GitHub.
Acceptance Criteria
- A `role = "team"` person with a team stamp resolves team; the same person with a community stamp, no stamp, muted, deny-listed or demoted in the file resolves community at the next call; an owner stamp for a team person resolves team; undeclared, declared-community and no-role people resolve community even with a team stamp; the owner with the bridge bit resolves owner; no role session resolves null; an unreadable allowlist file resolves community.
- `roleAllowsPlugin` allows every read plugin for every role, every plugin for owner and null, only the review and search tools (plus the work tools with the work flag) of the mutating plugins for team, none for community; `TEAM_SEARCH_TOOLS` is exactly `web-search` and `gif-search`, and the team catalog offers both (allowlisted) while the community catalog offers neither; team still gets neither `web-fetch` nor `discord-send-file`; a community role session's `runPlugin gif-search` gets the role refusal while a team one reaches the handler (`tests/gif.search.test.ts`).
- As team, `github-issue-comment` and `github-pr-review` run (dry-run) on an allowlisted repo and a non-allowlisted repo gets GITHUB-6; every other mutating plugin gets the role refusal; `files-write` runs only with the work flag and SAFE-2 still refuses `.env`; memory store/recall stay in the actor's scope, forget/override are refused.
- As team, `github-pr-review --event COMMENT` runs and `APPROVE` / `REQUEST_CHANGES` (any case) get the role refusal naming IDENTITY-10; the owner runs all three events.
- In a team `/work` run `files-write` refuses `credentials.json`, `id_rsa`, `*.pem` and `.ssh/…`, and `files-edit` on a secret file refuses without saying whether the old string matched, leaving the file unchanged; the owner edits it.
- Team reads pass on an allowlisted or confirmed-public repo and are refused on a private non-allowlisted one; team writes on a public non-allowlisted repo are refused; community writes are refused; deny lists win.
- Every existing ROLES-CHAT test passes unchanged; regression tests in `tests/roles.team.test.ts` fail on the base sources and pass after.
- In a scheduled run a public repo off the allowlist is refused for every role before any visibility lookup, and the role rules still apply to an allowlisted one (`tests/github.schedule-repo-gate.test.ts`).
- In a WATCH env the owner's GitHub id with the owner stamp resolves owner, a team member's with the team stamp team, and a team member's run gets the review tools but not `files-edit` even with a stale work stamp (`tests/watch.github-roles.test.ts`).

## Added

### REQUIREMENT REQ-plugins-1201

IDENTITY-12.a (#65, captured from Leif's 2026-09-28 interview, round 16):
"On GitHub, the owner and team members I've declared get their role's tools
too, behind the same must-ask gate; anyone else stays community." The tool
layer SHALL resolve a WATCH run's role from the person who triggered it, at
every call, the way it resolves a Discord run's (IDENTITY-12):

- `isWatchRunEnv(env)` (`src/plugins/roles.ts`) SHALL be true when the
  surface stamp `CORVIDINHO_ACTING_SURFACE` is `watch` (both spawning clients
  always overwrite it). In such a run the role SHALL come only from the GitHub
  numeric id the WATCH spawn stamps (`CORVIDINHO_ACTING_GITHUB_ID`, REQ-watch-1201),
  matched in the owner's people list re-read now (`loadDeclaredPeople` +
  `resolvePerson`, the owner's `[owner] github_id` included, IDENTITY-7.a) —
  never a login and never a Discord id. A run whose surface is not `watch`
  SHALL never use the GitHub keys.
- `resolveActingIsAdmin` SHALL be true in a WATCH run only with the ADMIN bit,
  an owner stamp (`actingRoleCap` owner), `CORVIDINHO_WATCH_SESSION_ID` set and
  that id resolving to the owner's person. `resolveActingRole` SHALL give
  `team` only with a team (or owner) stamp and a person whose declared role is
  team; anything else is `community`. Either way the id SHALL count as
  community when it, or `CORVIDINHO_ACTING_GITHUB_LOGIN`, is on the GitHub
  `deny_users` list, when the person's Discord id is muted
  (`DISCORD_MUTED_USER_IDS`) or on `[discord].deny_users`, when there is no
  id or no WATCH session id, and on any read failure (never throws).
- `actingWorkTask` SHALL be false in a WATCH run whatever its stamp (a WATCH
  run works in the watcher's checkout, never a `/work` worktree), so team
  gets its review and search tools there but never the work tools.
- `runPlugin` is unchanged: the owner's WATCH run reaches the must-ask gate
  (REQ-plugins-097) for every must-ask call — a `git-push` to the default
  branch, a `discord-post-message` — which raises the owner's Approve card
  (`… · from watch:<session>`) on the shared approvals store that the running
  bridge DMs, and runs only on an approval it uses once; a deny or no answer
  runs nothing (SAFE-20). Team and community WATCH runs are refused an
  owner-only tool for their role before any card.
- `secretPathsRefused` (`plugins/files/protectedPaths.ts`) SHALL be true in
  every WATCH run, the owner's included — the answer goes to a public GitHub
  thread — so the file, search and git tools refuse and hide secret-looking
  paths there (ROLES-CHAT-8, REQ-plugins-267); the refusal line says "not
  available in community chat or on GitHub".
- Unchanged on GitHub: the shell, runners and Fledge runs are never offered
  (SAFE-3.a, `shellToolsGate`), `delegate` / `council` workers are community
  (the worker env drops every `CORVIDINHO_ACTING_*` key), WATCH runs never
  approve or archive a SpecSync change (AGENT-18.a), the memory plugins' GitHub
  rules (REQ-plugins-067, REQ-plugins-710). No env var, config key, flag,
  table or schema change.

Acceptance Criteria
- With the env a real WATCH spawn hands its child: the owner's id with the owner stamp → owner (ADMIN re-check true); the team member's with the team stamp → team.
- The owner stamp on a stranger's, a re-registered login's or a declared community person's id, a team stamp on the owner's id, a community stamp, a login with no id, the owner's Discord id in a WATCH env, and no WATCH session id → community.
- Surface `chat` with the owner's GitHub id and no Discord actor → community; with the owner's Discord id → owner.
- A team member demoted in the file, on GitHub `deny_users` by login or by id, on `[discord].deny_users` or muted → community at the next call; the owner with no `[owner] github_id` or an unreadable file → community.
- The owner's WATCH run: a mutating `prod` must-ask command raises one `mustask` card titled `… · from watch:watch_w1`, runs once on approval and is refused with nothing run on a deny; team, community and a re-registered login's runs get `not allowed for your role` and no card.
- `secretPathsRefused` is true for the owner's WATCH run and false for the owner's Discord run; `shellToolsGate` refuses the owner's WATCH run; a `delegate` worker built from it resolves community.
- `tests/watch.github-roles.test.ts` fails on the base sources and passes on the branch.
