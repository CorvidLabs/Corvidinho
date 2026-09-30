---
module: plugins
change: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
---

# Delta: plugins (SpecSync change tools, and the own-change approve and archive steps — AGENT-18, AGENT-18.a)

## Added

### REQUIREMENT REQ-plugins-518

SpecSync change tools (AGENT-18, captured on main; its SpecSync clause).
`specsync-change-status` (read-only, minTier 0) SHALL return
`specsync change status [id]` and refuse `--root`.
`specsync-change-new` and `specsync-change-answer` SHALL be mutating, not
dangerous, minTier 2 (code), and in `TEAM_WORK_TOOLS` (REQ-plugins-065);
each SHALL refuse a forwarded `--root` / `--root=…` (exit 1) and, when the
project's SpecSync change workflow is off (`repoWaysNow`: the working tree,
HEAD and the run's base merged with the run's start scan, REQ-agent-518),
`SDD_OFF_REFUSAL` (exit 2), before spawning anything.
`specsync-change-new` SHALL pass its args to `specsync change new`, list the
open change folders (`.specsync/changes/*/state.json` ids) before and after,
record each id its spawn added in the run's ledger (`noteOpenedChange`,
REQ-agent-519) and return them as `data.opened`.
`specsync-change-answer <id> <question> <answer…>` SHALL take a slug id (no
path, no `..`, no flag) and a question, join the remaining args into one
answer, and spawn `specsync change answer <id> <question> <answer>`. In a
repo that keeps hi criteria (REQ-agent-518) an `acceptance_criteria` answer
SHALL cite at least one hi id (`FAMILY-N[.x]` whose family `hi export`
lists; other upper-case tokens such as `SHA-256` are not citations) and
every cited id SHALL be a criterion `hi export` shows (retired ones are not):
none cited, one not captured, or `hi export` unreadable SHALL refuse (exit 2)
naming why, with nothing spawned. Other questions and repos without hi are
not checked. `specsync` and `hi` SHALL be found on the PATH in effect at the
call. `PluginCommand.agentTool?: boolean` SHALL exist: `false` keeps a
command out of the agent's tool catalog whatever the allowlist (REQ-agent-065).
No env var, config key, flag or schema.

Acceptance Criteria
- `specsync-change-new` / `-answer` are mutating, not dangerous, minTier 2, in `TEAM_WORK_TOOLS`; `specsync-change-status` is read-only at minTier 0.
- In a repo with no enabled `sdd.json`, `specsync-change-new` and `-answer` return `SDD_OFF_REFUSAL`; `--root` is refused; nothing is spawned.
- In an SDD repo `specsync-change-new "Fix the app" --kind bug-fix --path src/app.ts` spawns `specsync change new`, returns `opened: ["fix-the-app"]` and records it in the run's ledger; `specsync-change-status fix-the-app` spawns `change status`.
- In a hi repo (fake `hi export`: AGENT-18, AGENT-18.a captured, AGENT-2 retired) answers citing nothing, citing AGENT-99 or citing AGENT-2 are refused with nothing spawned; one citing AGENT-18.a spawns with the joined answer; `public_contract` and a repo without hi are not checked.
- `citedHiIds` finds `AGENT-18`, `DISCORD-SCHEDULE-1.a` and `MEMORY-7.a` and ignores `SHA-256`, `UTF-8` and `REQ-agent-518`.

### REQUIREMENT REQ-plugins-519

Own-change approve and archive (AGENT-18.a, captured in this change with
`hi` from Leif's 2026-09-28 interview, round 13). `specsync-change-approve`
and `specsync-change-finalize` SHALL be dangerous (SAFE-1 allowlist in
non-interactive runs, SAFE-5 audit), minTier 2, `agentTool: false` (never
offered to the model; `runTask` runs them, REQ-agent-519) and in
`TEAM_WORK_TOOLS`. Each SHALL refuse `--root`, a workflow that is off, a bad
id or extra args, then refuse (exit 2) with the `selfLifecycleRefusal` line,
spawning nothing, unless all hold: the run is not a delegate or council
worker (delegation depth 0), not WATCH (`CORVIDINHO_WATCH_SESSION_ID`), not a
schedule (`schedule_` session or a `watch` / `schedule` surface stamp) and
not a community role; the project is Corvidinho itself
(`isCorvidinhoProject`), else `HUMAN_LIFECYCLE_LINE` ("in this repo a human
approves, reviews and finalizes SpecSync changes"); the id is one the
current run's ledger recorded; and `runTask` is settling it right after a
green lane (the ledger's verified mark). Approve SHALL spawn
`specsync change approve <id> --actor corvid-agent`; finalize SHALL spawn
`specsync change check <id>`, `specsync change review <id> --reviewer
corvid-agent` and `specsync change finalize <id>` in that order, stopping at
the first failure with an error naming the step. `isCorvidinhoOriginUrl`
SHALL accept only github.com with the path CorvidLabs/Corvidinho (https with
or without credentials or `.git`, ssh or scp form, any case).

Acceptance Criteria
- Both are dangerous, minTier 2, `agentTool: false`, never offered even allowlisted, refused for community.
- Outside Corvidinho, even for this run's own change with the verified mark, both return `HUMAN_LIFECYCLE_LINE` and nothing is spawned.
- On Corvidinho: no run or a change this run did not open → "not a SpecSync change this run opened"; before the verified mark → "only right after the verify lane is green"; WATCH, a `schedule_` session, a `schedule` stamp, a worker and a community role are refused; with all conditions met and the tool allowlisted approve spawns `change approve c1 --actor corvid-agent`; not allowlisted is a SAFE-1 denial before the handler.
- A repo whose origin is CorvidLabs/Corvidinho but is not this checkout is not Corvidinho; the checkout and its linked worktree are; changing the origin makes it not.
- Origin URL forms: the five Corvidinho forms match; a fork name, another host, a longer path, a look-alike host and a local path do not.

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
without a role, WATCH / schedules / workers (community stamp or no actor), and
any read failure. A stamp never raises the role. `roleAllowsPlugin(role, cmd,
workTask)` SHALL be the one rule: read plugins for every role; mutating
plugins (`isMutatingPlugin`) for the owner and `null`; for team only
`TEAM_REVIEW_TOOLS` (`github-issue-comment`, `github-pr-review`) plus, when
`CORVIDINHO_ACTING_WORK_TASK` is truthy (a `/work` run), `TEAM_WORK_TOOLS`
(`files-write`, `files-edit`, and working that repo's SpecSync change:
`specsync-change-new`, `specsync-change-answer`, `specsync-change-approve`,
`specsync-change-finalize`, AGENT-18 / AGENT-18.a; the last two stay
dangerous, so SAFE-1 still applies); for community none (IDENTITY-10/11).
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
- `TEAM_WORK_TOOLS` is exactly `files-edit`, `files-write`, `specsync-change-answer`, `specsync-change-approve`, `specsync-change-finalize` and `specsync-change-new`; `specsync-change-new` / `-answer` pass the role gate for team only with the work flag and never for community (`tests/roles.team.test.ts`, `tests/agent.repo-ways.test.ts`).

### REQUIREMENT REQ-plugins-083

`files-write`, `files-edit`, and `files-delete` SHALL hard-refuse protected
project infra with no override (SAFE-2): `.env` / `.env.*`, `.git` components,
basename `fledge.toml`, any `.fledge` path component (Fledge lane imports
and config such as `.fledge/lanes/*.toml`, which the verify gate runs, so a
run cannot weaken the checks it is verified by: SAFE-2.a; reads stay
allowed), basename `bunfig.toml` / `.bunfig.toml` (Bun runtime
config whose `preload` would run code in spawned agents), paths under `specs/`
or ending in `.spec.md`, SpecSync state under `.specsync/` (config, registry,
version, archive, and `.specsync/changes` / `.specsync/changes/<id>`
themselves) except the files inside an active change folder
`.specsync/changes/<id>/` (which stay writable so change artifacts can be
filled, SPECSYNC-4) other than SpecSync's own lifecycle records there, and
any path component inside the project containing
`keystore` (a keystore file such as `wallet-keystore.json` or any file under a
keystore directory such as `keystore/UTC--…`). Components of the project
root's own absolute path SHALL NOT be matched against `keystore`, so a project
checked out under a keystore-named directory keeps its ordinary files
writable; nor SHALL a SpecSync change folder's name (`.specsync/changes/<id>/`,
`.specsync/archive/changes/<id>/`), which is a slug of the change title.
SpecSync's own lifecycle records in an active change folder, the `*.json`
files directly in `.specsync/changes/<id>/` (state, approvals, review,
verification; `isSddRecordPath`), SHALL be refused by `files-write`,
`files-edit` and `files-delete` (exit 2, a "SpecSync lifecycle record"
refusal naming `specsync-change-answer`): only the `specsync change` commands
write them, so a run cannot widen the paths its change covers past the
REQ-agent-518 gate, put acceptance criteria in past the REQ-plugins-518 hi
check, or write an approval or review a human owes (AGENT-18, AGENT-18.a).
They stay out of `isProtectedPath`, so git-commit still stages their
deletion when a change is archived.

Acceptance Criteria
- Protected write/edit/delete tests refuse; target file unchanged after refuse.
- files-write of `bunfig.toml` / `.bunfig.toml` (any directory) is refused and no file is created.
- files-write, files-edit and files-delete of a file under a keystore directory (`keystore/UTC--…`, `config/Keystore/wallet.json`), a new file there, or a symlink resolving into one are refused with SAFE-2 (exit 2) and the file is unchanged / not created.
- files-write, files-edit and files-delete of `.specsync/config.toml`, `.specsync/registry.toml`, a new `.specsync/` top-level file or a `.specsync/archive/` file are refused with SAFE-2 (exit 2); a file under `.specsync/changes/<id>/` is still written, also when `<id>` contains `keystore`; files-write of `.specsync/changes` or `.specsync/changes/<id>` itself is refused and nothing is created.
- In a project whose root directory name contains `keystore`, files-write (relative or absolute path) and files-edit of ordinary files succeed, and `keystore/…` inside it is still refused.
- git-commit refuses to stage the deletion of `.specsync/config.toml` (exit 2, SAFE-2) and stages the deletion of a `.specsync/changes/<id>/` file.
- files-write, files-edit and files-delete of a file under `specs/` that does not end in `.spec.md` (`specs/agent/requirements.md`, `specs/agent/context.md`) and files-write of a new `specs/notes.md` are refused with SAFE-2 (exit 2); the files are unchanged and the new file is not created (the test fails with the `specs` component rule removed).
- files-write, files-edit and files-delete of `.fledge/lanes/verify.toml` and `.fledge/config.toml` (also spelled `./.fledge/…`, `src/../.fledge/…`, `.FLEDGE/…` or as an absolute path, through a symlink to the lane file or a symlink to `.fledge/lanes`), files-write of a new `.fledge/lanes/extra.toml`, of a dangling symlink to a missing lane file and of `.fledge` itself in a project without one are refused with the SAFE-2 refusal (exit 2, text names `.fledge`); the files are unchanged and nothing is created; files-read and files-list of `.fledge/` still work (SAFE-2.a; the test fails with the `.fledge` component rule removed).
- git-commit refuses to stage the deletion of a tracked `.fledge/lanes/verify.toml` or `.fledge/config.toml` (exit 2, SAFE-2); the path stays in `ls-files` and nothing is staged (SAFE-2.a; fails with the `.fledge` rule removed).
- files-write, files-edit and files-delete of `.specsync/changes/<id>/state.json`, files-write of its `approvals.json` and of a planted `.specsync/changes/<new>/state.json` are refused (exit 2, "SpecSync lifecycle record"); the file is unchanged and nothing is created, so a planted or widened change does not cover an edit; `tasks.md` and `deltas/agent.md` in that folder are still written (`tests/agent.repo-ways.test.ts`; fails with the rule removed from the file tools).

### REQUIREMENT REQ-plugins-114

The system SHALL measure the context cost of each loaded plugin command on the
exact tool definition sent to the model (`toolDefForEntry`), as JSON
characters and approximate tokens (chars/4), and SHALL report the loaded tool
surface as a whole (FLEDGE-5 / PLUGIN-6): total approximate tokens if every
loaded command were offered, a default budget of ~9000 tokens (raised from
~8000 when the five SpecSync change tools of AGENT-18 / AGENT-18.a joined the
builtins) with an over-budget flag, subtotals by origin (`builtin` or
`fledge:<plugin>@<version>`), the largest schemas, and commands whose schema
exceeds a ~250-token soft cap. `PluginCommand` MAY carry an `origin`; the
registry `list()` shape is unchanged.

Acceptance Criteria
- `withToolCost` adds `origin`, `schemaChars`, `approxTokens` (= ceil(schemaChars/4)) per entry.
- `toolSurfaceReport` totals match the per-entry sum, group by origin, and flag over-budget / oversized with small test budgets.
- The text view prints per-command `~N tok`, the total vs budget with `OVER BUDGET` when exceeded, per-origin subtotals and oversized names.
- The builtins plus a discovered Fledge plugin, with the SpecSync change tools loaded, stay under the default budget (`tests/fledge.plugins.test.ts`).
