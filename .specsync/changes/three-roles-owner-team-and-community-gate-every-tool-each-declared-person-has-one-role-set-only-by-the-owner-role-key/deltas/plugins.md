---
module: plugins
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
---

# Delta — plugins (three roles gate every tool; community site / roadmap readers)

## Added

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
without a role, WATCH / schedules / workers (community stamp or no actor), and
any read failure. A stamp never raises the role. `roleAllowsPlugin(role, cmd,
workTask)` SHALL be the one rule: read plugins for every role; mutating
plugins (`isMutatingPlugin`) for the owner and `null`; for team only
`TEAM_REVIEW_TOOLS` (`github-issue-comment`, `github-pr-review`) plus, when
`CORVIDINHO_ACTING_WORK_TASK` is truthy (a `/work` run), `TEAM_WORK_TOOLS`
(`files-write`, `files-edit`); for community none (IDENTITY-10/11).
`runPlugin` SHALL refuse a mutating plugin the role does not allow with the
existing `Denied: plugin "<name>" is not allowed for your role
(ROLES-CHAT-3).` (exit 2) before SAFE-1, the audit row or the handler; SAFE-1,
SAFE-2, SAFE-5 and the memory ACL (forget / override stay owner-only,
REQ-plugins-011) still apply to whatever the role allows.
`checkRepoGateForActingRole(repo, { write })` SHALL keep deny lists first,
then: team reads pass on a GITHUB-6-allowlisted repo or a confirmed-public one;
team writes (`write: true`, passed by `github-issue-create`,
`github-issue-comment`, `github-pr-create`, `github-pr-review`) pass only on an
allowlisted repo; community reads keep the confirmed-public path
(ROLES-CHAT-8) and community writes are refused; owner and `null` keep the
GITHUB-6 allowlist. Secret-path hiding (REQ-plugins-267) keeps treating team
like community. No new table, column or schema version; the two env keys are
internal, set only by the Discord spawn client.

Acceptance Criteria
- A `role = "team"` person with a team stamp resolves team; the same person with a community stamp, no stamp, muted, deny-listed or demoted in the file resolves community at the next call; an owner stamp for a team person resolves team; undeclared, declared-community and no-role people resolve community even with a team stamp; the owner with the bridge bit resolves owner; no role session resolves null; an unreadable allowlist file resolves community.
- `roleAllowsPlugin` allows every read plugin for every role, every plugin for owner and null, only the review tools (plus the work tools with the work flag) of the mutating plugins for team, none for community.
- As team, `github-issue-comment` and `github-pr-review` run (dry-run) on an allowlisted repo and a non-allowlisted repo gets GITHUB-6; every other mutating plugin gets the role refusal; `files-write` runs only with the work flag and SAFE-2 still refuses `.env`; memory store/recall stay in the actor's scope, forget/override are refused.
- Team reads pass on an allowlisted or confirmed-public repo and are refused on a private non-allowlisted one; team writes on a public non-allowlisted repo are refused; community writes are refused; deny lists win.
- Every existing ROLES-CHAT test passes unchanged; regression tests in `tests/roles.team.test.ts` fail on the base sources and pass after.

### REQUIREMENT REQ-plugins-066

Community site / roadmap readers (ROLES-CHAT-8.a). Corvidinho SHALL register
two read-only GitHub commands (`dangerous: false`, `minTier: 0`, Octokit,
never shell `gh`) in `plugins/github/public-docs.ts`, both behind the acting
role's `--repo` gate (`checkRepoGateForActingRole`: deny wins; community ⇒
confirmed public; team ⇒ allowlisted or public; owner / CLI ⇒ GITHUB-6):
`github-docs-read` reads one doc on the default branch — the README (default,
`repos.getReadme`), a root `README*` / `STATUS*` / `CHANGELOG*` file, or
anything under `docs/` (a directory lists its `docs/` entries, at most 200) —
and SHALL refuse any other path (`publicDocPath`: no `..`, `.` or empty
segments, no backslashes) with exit 2 before GitHub is called, for every role;
text is SAFE-6 scrubbed, capped at 64 KiB with a truncation flag, labelled
untrusted; a non-file or binary entry is refused. `github-milestone-list`
lists milestones (`issues.listMilestones`, `--state open|closed|all`,
`--limit` 1–100) with number, title, state, a ≤500-char scrubbed description,
due date and open / closed issue counts. Issues stay `github-issue-list`.
`web-fetch` stays dangerous, so no site URL is a community source.

Acceptance Criteria
- `publicDocPath` accepts README / STATUS / CHANGELOG at the root (any case, optional extension) and `docs` / `docs/**`; it refuses source files, `.env`, `..`, nested READMEs, backslashes and empty segments.
- In a community session with a public repo, README, `STATUS.md` and a `docs/` file are read (secrets scrubbed, untrusted note), a `docs/` directory lists its entries, a doc over 64 KiB is truncated and a binary doc is refused.
- Any other path is refused with exit 2 and no GitHub call, also from the CLI; a private, unconfirmed or denied repo is refused before any read.
- Milestones map state, due date, counts and a 500-char description; `--state` / `--limit` reach the API; bad flags are refused.
- The community catalog offers both readers and `github-issue-list` and never `web-fetch`, even allowlisted.
- Regression tests in `tests/github.public-docs.test.ts` fail on the base sources and pass after.
