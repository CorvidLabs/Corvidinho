---
module: plugins
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
---

# Delta: plugins (a WATCH run never writes the watcher's own checkout; its audit rows and cards name its GitHub trigger — IDENTITY-12.a follow-up to #374)

## Modified

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
- Since REQ-plugins-1202 (follow-up to #374) a WATCH run SHALL never run
  the tools that write the watcher's own checkout, `git-push` included,
  whatever its role, so the owner's WATCH must-ask calls are the rest (a
  `discord-post-message`, a prod or deploy call); since REQ-plugins-1203 its
  SAFE-5 rows and card requester are `github:<id>`, never `local`.

Acceptance Criteria
- With the env a real WATCH spawn hands its child: the owner's id with the owner stamp → owner (ADMIN re-check true); the team member's with the team stamp → team.
- The owner stamp on a stranger's, a re-registered login's or a declared community person's id, a team stamp on the owner's id, a community stamp, a login with no id, the owner's Discord id in a WATCH env, and no WATCH session id → community.
- Surface `chat` with the owner's GitHub id and no Discord actor → community; with the owner's Discord id → owner.
- A team member demoted in the file, on GitHub `deny_users` by login or by id, on `[discord].deny_users` or muted → community at the next call; the owner with no `[owner] github_id` or an unreadable file → community.
- The owner's WATCH run: a mutating `prod` must-ask command raises one `mustask` card titled `… · from watch:watch_w1`, runs once on approval and is refused with nothing run on a deny; team, community and a re-registered login's runs get `not allowed for your role` and no card.
- `secretPathsRefused` is true for the owner's WATCH run and false for the owner's Discord run; `shellToolsGate` refuses the owner's WATCH run; a `delegate` worker built from it resolves community.
- `tests/watch.github-roles.test.ts` fails on the base sources and passes on the branch.
- The owner's WATCH `files-edit` / `git-commit` are refused before any card (REQ-plugins-1202, `tests/watch.github-roles.postreview.test.ts`).

## Added

### REQUIREMENT REQ-plugins-1202

IDENTITY-12.a follow-up to #374 (SESSION-WORKTREE-1 on GitHub): a WATCH run
works in the watcher's own checkout (`task run --here`, REQ-cli-122 — the
checkout every WATCH, Discord and daemon spawn runs `src/cli.ts` from) and
has no worktree of its own. `runPlugin` SHALL refuse, before the role gate,
every `WATCH_CHECKOUT_WRITE_TOOLS` command (`src/plugins/roles.ts`) —
`files-write`, `files-edit`, `files-delete`, `git-branch-create`,
`git-commit`, `git-push`, `specsync-change-new`, `specsync-change-answer`,
`specsync-change-approve`, `specsync-change-finalize` — when
`watchCheckoutWriteRefused(env, name)` holds (the surface stamp is `watch`
or `CORVIDINHO_WATCH_SESSION_ID` is set), for every role, the owner's
included: exit 2 with `watchCheckoutWriteRefusal(name)` ("… writes the
watcher's own checkout, and a GitHub (WATCH) run has no worktree of its own,
so it never runs there, whoever triggered it (SESSION-WORKTREE-1)"). Nothing
in the checkout, its branches or its index changes. Discord, `/work`,
schedules and the local CLI are unchanged. No env var, config key, flag,
table or schema change.

Acceptance Criteria
- With the env a real WATCH spawn hands the owner's run: `files-edit`, `files-write`, `files-delete`, `git-branch-create` and `git-commit` in a git checkout are refused with that line, and the checkout's files, branches and status are unchanged.
- The owner's Discord run still writes a file there.
- `tests/watch.github-roles.postreview.test.ts` fails on the base sources and passes on the branch.

### REQUIREMENT REQ-plugins-1203

IDENTITY-12.a follow-up to #374 (SAFE-5, AUTONOMY-9/10): `auditContextFromEnv`
(`src/audit/log.ts`) SHALL give a run with no Discord actor and a
`CORVIDINHO_WATCH_SESSION_ID` the actor `github:<CORVIDINHO_ACTING_GITHUB_ID>`
(a numeric id), else `github:<CORVIDINHO_ACTING_GITHUB_LOGIN>` (lowercased,
when a valid login), else `github:(unknown)` — never `local`, which stays the
local CLI's. `runPlugin`'s SAFE-5 rows and the must-ask gate's card requester
and earlier-denial key (REQ-plugins-097) use it, so the owner's and a team
member's WATCH calls are told apart from each other and from the operator's
CLI, and an owner's deny on a WATCH card never refuses the same local CLI call
as resent (nor the reverse). A Discord actor still wins; the surface is
unchanged (`watch:<session>`). No env var, config key, table or schema change.

Acceptance Criteria
- A team member's WATCH `github-pr-review` (dry run) appends `started` and `ok` rows with actor `github:<their id>` and surface `watch:watch_w1`.
- The owner's WATCH must-ask card has requester `github:<owner id>`; after the owner denies it, the same call from the local CLI raises a new card (requester `local`) and runs on approval.
- `auditContextFromEnv({ CORVIDINHO_WATCH_SESSION_ID: "w1" })` gives actor `github:(unknown)`; with no session, `local` / `cli`.
- `tests/watch.github-roles.postreview.test.ts` fails on the base sources and passes on the branch.
