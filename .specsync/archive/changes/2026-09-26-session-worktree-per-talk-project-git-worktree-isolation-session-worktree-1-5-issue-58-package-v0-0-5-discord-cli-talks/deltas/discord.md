---
module: discord
change: session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks
---

# Delta — discord (SESSION-WORKTREE isolation)

## Added

### REQUIREMENT REQ-discord-022

Corvidinho SHALL isolate Discord/CLI talks and scheduled single-project runs
in per-talk (or per-schedule-run) git worktrees or project-scoped directories
so filesystem and branch state do not bleed across concurrent conversations
(SESSION-WORKTREE-1..5). Soft session TTL and new-topic rules (SESSION-1..3 /
REQ-discord-019) SHALL remain; isolation SHALL NOT replace MEMORY for
cross-session continuity (SESSION-4 / SESSION-WORKTREE-2).

Project selection SHALL be explicit per talk or schedule. The default project
for a talk is the bridge `projectRoot` unless an optional `project` option is
supplied on existing `/session start` or `/work` (no new slash command names).
Once a session's project is set it SHALL NOT silently switch mid-conversation
(SESSION-WORKTREE-4). `/schedule` ticks SHALL resolve the schedule's `project`
and run the agent in that project's worktree/scope (align DISCORD-SCHEDULE).

Ending, abandoning, or TTL-purging a talk SHALL park or remove its worktree so
another talk never silently reuses it as cwd (SESSION-WORKTREE-3). Provenance:
steal corvid-agent `server/lib/worktree*` — Linux headless only; no ProcessManager
(SESSION-WORKTREE-5). Session worktree bookkeeping SHALL persist on shared
SQLite schema **v4**. Package version SHALL bump to **0.0.5**. Fixture tests
without live Discord.

Acceptance Criteria
- Worktree manager create/remove/park/prune under `.corvid-worktrees` (or `WORKTREE_BASE_DIR`).
- Concurrent talks get distinct worktree paths/branches.
- Continue-session keeps the same project/worktree; no silent mid-talk switch.
- Optional `project` on `/session start` and `/work`; schedule ticks use schedule.project scope.
- TTL purge / end parks or removes worktree (no silent leftover cwd reuse).
- SESSION soft TTL fixtures still pass; MEMORY continuity unchanged.
- Schema migrates to v4 with session worktree columns.
- Package `0.0.5`; docs/STATUS/CHANGELOG updated.
- Fixture tests + SpecSync + fledge verify green.

## Modified

### REQUIREMENT REQ-discord-009

Slash command set SHALL include `/schedule` (list|create|pause|resume|delete)
in addition to session/status/agents/work/mute/unmute. Registration overwrites
the **current** body set (seven commands), not a frozen six.
`/session start` and `/work` MAY accept an optional `project` string option for
explicit project selection (SESSION-WORKTREE-4 / REQ-discord-022). No new slash
command names.

Acceptance Criteria
- `buildSlashCommandBodies()` includes schedule with list/create/pause/resume/delete.
- Session start + work have optional `project`.
- Bodies remain fixture-testable without live Discord.
- Mute/unmute and prior DISCORD-4 commands still present.

### REQUIREMENT REQ-discord-018

Operator docs (`docs/discord.md`) SHALL document `/schedule` alongside the
prior slash inventory and DISCORD-SCHEDULE behavior, and SHALL document
per-talk worktree isolation, optional `project` on `/session start` and `/work`,
schedule project scope, and `WORKTREE_BASE_DIR` / `.corvid-worktrees` rooting
(SESSION-WORKTREE / REQ-discord-022).

Acceptance Criteria
- `docs/discord.md` lists `/schedule` subcommands and admin mutation note.
- `docs/discord.md` covers SESSION-WORKTREE behavior and env.
- Deny flowchart / mermaid-docs-only note unchanged in intent.

### REQUIREMENT REQ-discord-019

Discord `SessionStore` (and `WorkStore`) SHALL optionally persist to a local
SQLite database under the shared Corvidinho data directory
(`~/.local/share/corvidinho/` by default, overridable via `CORVIDINHO_DATA_DIR`)
so session and work stubs survive process restarts (SESSION durable substrate).
Cross-session continuity SHALL use the same shared SQLite file via MEMORY
tables (REQ-discord-021), not a long-lived ProcessManager.

Soft TTL SHALL default to about **45 minutes** (within SESSION-2's 30–60 minute
band), overridable via `CORVIDINHO_SESSION_TTL_MS` clamped to that band.
Continued activity (`touch` / continue paths) SHALL refresh `lastActivityAt`
(SESSION-2). Lookups for sessions idle past the TTL SHALL treat them as expired
and SHALL NOT continue them, so the next eligible mention starts a fresh
session (SESSION-1 / SESSION-3).

The bridge SHALL open the shared DB when starting (unless tests inject
in-memory stores). Schedules and memories MAY share the same SQLite file
(REQ-discord-020 / REQ-discord-021). Fixture tests SHALL cover persist/reload
and TTL expiry without a live Discord token.

Acceptance Criteria
- Session create + bot-message/thread maps reload from SQLite after reopen.
- Work task stubs reload from the same DB after reopen.
- Default TTL ~45m; env override clamped to 30–60m.
- Idle past TTL → getByThread/getByBotMessage/get/list omit or purge; continue path does not resume.
- Activity within TTL keeps continue_session.
- Data dir defaults to `~/.local/share/corvidinho/`; `CORVIDINHO_DATA_DIR` overrides.
- Memories share `corvidinho.db` (schema v3) without a second database.
- No ProcessManager; secrets out of repo; existing allowlists unchanged.
- Fixture tests pass without live Discord token.

Session durable store SHALL additionally persist optional worktree fields
(`project`, `worktree_path`, `worktree_branch`, `worktree_state`) on schema **v4**
without breaking soft TTL behavior (SESSION-WORKTREE / REQ-discord-022). Soft TTL
purge SHALL park or remove the session worktree before dropping the row
(SESSION-WORKTREE-3).

Acceptance Criteria (worktree addendum)
- Schema v4 migration adds worktree columns; reload restores worktree binding.
- Soft TTL purge parks/removes worktree then drops session row.
- Prior TTL fixtures still green.

### REQUIREMENT REQ-discord-020

Corvidinho SHALL expose Discord slash `/schedule` with subcommands
`list|create|pause|resume|delete` so an admin can create a recurring
single-project agent run with a human-readable cadence (cron, `@hourly` /
`@daily` / …, or `every N minutes|hours`) plus a target `project` and
`prompt` (DISCORD-SCHEDULE-1..2). Pipeline templates, flock, council, and
on-chain extras are out of scope for this requirement.

Mutations (`create|pause|resume|delete`) SHALL re-check ADMIN at handler time
(DISCORD-7 / ADMIN-4); empty admin/owner lists SHALL deny-all. `list` MAY be
used by allowlisted actors after normal channel and rate/mute gates.

Cadence SHALL enforce a minimum interval of **5 minutes** at create time.
Schedules SHALL persist in the shared Corvidinho SQLite database. The bridge
SHALL run a cooperative ~60s ticker that fires due active schedules
asynchronously with a small concurrency cap so live Discord HEAR and GitHub
WATCH ingress remain ≤ ~1 minute (DISCORD-SCHEDULE-4). Schedule ticks SHALL
re-check channel allowlists (and rely on existing SAFE gates) so a schedule
cannot post or act outside channels/repos already allowed (DISCORD-SCHEDULE-3).
Provenance: steal archived corvid-agent schedule slash + scheduler + ADR
(DISCORD-SCHEDULE-5). No ProcessManager. Fixture tests without live Discord.

Acceptance Criteria
- `/schedule` registered with list/create/pause/resume/delete bodies.
- Admin can create with cadence + project + prompt; non-admin / empty admin denied.
- Cadence `<5m` refused; `>=5m` / `@hourly` accepted.
- list/pause/resume/delete behave; pause skips ticks; resume recomputes next_run.
- Optional create `channel` must be allowlisted; tick re-checks before post.
- Tick returns without awaiting agent; concurrent cap respected.
- Schedules reload from shared SQLite after reopen.
- Durable SessionStore/WorkStore from SESSION (#61) remains the bridge path.
- No flock/council/templates/on-chain/ProcessManager; secrets out of repo.
- Fixture tests + SpecSync + fledge verify green.

Schedule ticks SHALL spawn the agent with cwd scoped to the schedule's
`project` worktree (or project-scoped directory), then park/remove that
workspace after the run, while keeping the cooperative non-blocking tick
semantics (SESSION-WORKTREE / REQ-discord-022).

Acceptance Criteria (worktree addendum)
- Tick resolves `schedule.project` → isolated cwd for `runChat`.
- After run, worktree parked/removed (no silent leftover reuse).
- Tick still returns without awaiting agent; concurrency cap unchanged.

