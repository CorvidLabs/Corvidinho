---
module: discord
change: discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume
---

# Delta — discord (DISCORD-SCHEDULE slash + cooperative ticker)

## Added

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

## Modified

### REQUIREMENT REQ-discord-009

Slash command set SHALL include `/schedule` (list|create|pause|resume|delete)
in addition to session/status/agents/work/mute/unmute. Registration overwrites
the **current** body set (seven commands), not a frozen six.

Acceptance Criteria
- `buildSlashCommandBodies()` includes schedule with list/create/pause/resume/delete.
- Bodies remain fixture-testable without live Discord.
- Mute/unmute and prior DISCORD-4 commands still present.

### REQUIREMENT REQ-discord-016

Guild PUT overwrite SHALL register the current `buildSlashCommandBodies()` set
(seven commands including `/schedule`) then clear globals when guild id is set.

Acceptance Criteria
- Guild register path PUTs seven bodies then clears globals.
- Global-only path warns when guild id unset.
- `discord register-commands` CLI still works against live Discord when configured.

### REQUIREMENT REQ-discord-018

Operator docs (`docs/discord.md`) SHALL document `/schedule` alongside the
prior slash inventory and DISCORD-SCHEDULE behavior.

Acceptance Criteria
- `docs/discord.md` lists `/schedule` subcommands and admin mutation note.
- Deny flowchart / mermaid-docs-only note unchanged in intent.

### REQUIREMENT REQ-discord-019

Discord `SessionStore` (and `WorkStore`) SHALL optionally persist to a local
SQLite database under the shared Corvidinho data directory
(`~/.local/share/corvidinho/` by default, overridable via `CORVIDINHO_DATA_DIR`)
so session and work stubs survive process restarts (SESSION durable substrate;
aligns with MEMORY-1 path for future #41 — this requirement does **not**
implement MEMORY ACL or conversation recall).

Soft TTL SHALL default to about **45 minutes** (within SESSION-2's 30–60 minute
band), overridable via `CORVIDINHO_SESSION_TTL_MS` clamped to that band.
Continued activity (`touch` / continue paths) SHALL refresh `lastActivityAt`
(SESSION-2). Lookups for sessions idle past the TTL SHALL treat them as expired
and SHALL NOT continue them, so the next eligible mention starts a fresh
session (SESSION-1 / SESSION-3). Cross-session continuity remains MEMORY's
responsibility later (SESSION-4), not a long-lived ProcessManager.

The bridge SHALL open the shared DB when starting (unless tests inject
in-memory stores) and SHALL NOT introduce ProcessManager or MEMORY product
surfaces. Schedules MAY share the same SQLite file (see REQ-discord-020).
Fixture tests SHALL cover persist/reload and TTL expiry without a live Discord
token.

Acceptance Criteria
- Session create + bot-message/thread maps reload from SQLite after reopen.
- Work task stubs reload from the same DB after reopen.
- Default TTL ~45m; env override clamped to 30–60m.
- Idle past TTL → getByThread/getByBotMessage/get/list omit or purge; continue path does not resume.
- Activity within TTL keeps continue_session.
- Data dir defaults to `~/.local/share/corvidinho/`; `CORVIDINHO_DATA_DIR` overrides.
- No ProcessManager; no MEMORY ACL; secrets out of repo; existing allowlists unchanged.
- Fixture tests pass without live Discord token.
