---
module: discord
change: scheduler-refuses-a-zero-cron-step-0-a-b-0-n-0-as-a-cadenceerror-and-bounds-cron-ranges-at-the-field-maximum-so
---

# Delta: discord (a zero cron step is a CadenceError and ranges stop at the field maximum, so /schedule create never hangs the bridge — REQ-discord-020)

## Modified

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

`delete` removes the schedule and its whole run history, so it SHALL leave
SAFE-5 audit rows on the shared chain the way `/admin` does (REQ-discord-043):
a `started` row (action `schedule-delete`, surface `discord:schedule`, actor
the invoker's user id, args digest of the resolved schedule id — never the raw
id) before anything is deleted, then `ok` or `error`; the reply SHALL name the
row numbers. A non-ADMIN `delete` SHALL append `denied`. When the `started`
row cannot be recorded — the trail throws (including a keyed chain on a
process without `CORVIDINHO_AUDIT_HMAC_KEY`) or no trail is wired (a bridge
without a DB) — `delete` SHALL fail closed with the ephemeral
`Refused: audit log unavailable (SAFE-5)` reply and delete nothing; it SHALL
never make an unaudited delete. An unknown or missing schedule id deletes
nothing and appends no row.

Cadence SHALL enforce a minimum interval of **5 minutes** at create time.
A cron step SHALL be 1 or more in every field: a zero step (`*/0`, `a-b/0`,
`n/0`, also inside a comma list) SHALL be refused as a `CadenceError` before
the field is expanded, so `/schedule create` replies with that message
ephemerally and creates nothing, and the store's next-run computation
(create, resume, claim) throws the same error. A range SHALL be expanded only
up to its field's maximum, so a range whose end is past it (`0-99999999999`)
resolves at once and the other cadence rules apply. No cadence SHALL hang the
bridge process that parses it (DISCORD-SCHEDULE-4).
Schedules SHALL persist in the shared Corvidinho SQLite database. The bridge
SHALL run a cooperative ~60s ticker that fires due active schedules
asynchronously with a small concurrency cap so live Discord HEAR and GitHub
WATCH ingress remain ≤ ~1 minute (DISCORD-SCHEDULE-4). Schedule ticks SHALL
re-check the live allowlist (and rely on existing SAFE gates) so a schedule
cannot post or act outside channels/repos already allowed (DISCORD-SCHEDULE-3):
before any worktree or agent run, and again right before the post, the
schedule's channel (when set) SHALL be allowlisted and the schedule's creator
SHALL pass the same actor gate as live ingress (`gateActor`, REQ-discord-201):
a deny-listed creator is refused (deny wins, the owner too); when the user or
role allowlist is non-empty the creator's user id SHALL be listed or be the
configured owner (a tick has no member roles, so a creator admitted only by a
listed role is refused); empty user and role lists leave the channel gate
alone. A run refused
before it starts SHALL create no worktree, spawn no agent and post nothing,
SHALL be recorded failed (`creator not allowlisted: …` or `channel not
allowlisted: <id>`) and SHALL count toward the 5-failure auto-pause; a run
whose creator or channel is refused by the time it would post SHALL NOT post.
No new env var, config key, slash command or option.
Provenance: steal archived corvid-agent schedule slash + scheduler + ADR
(DISCORD-SCHEDULE-5). No ProcessManager. Fixture tests without live Discord.

Acceptance Criteria
- `/schedule` registered with list/create/pause/resume/delete bodies.
- Admin can create with cadence + project + prompt; non-admin / empty admin denied.
- Cadence `<5m` refused; `>=5m` / `@hourly` accepted.
- A zero cron step (`*/0 * * * *`, `0-59/0 * * * *`, `0,*/0 * * * *`, `5/0 * * * *`, or `/0` in the hour, day, month or weekday field) is refused with the ephemeral `Invalid cron step in "…": the step must be 1 or more.`, nothing is created, and the bridge keeps answering; `parseCron` / `getNextCronDate` throw the same `CadenceError`.
- A range past its field's maximum resolves at once: `0-99999999999 * * * *` is refused by the 5-minute rule and `0 0-99999999999/2 * * *` runs like `0 */2 * * *`; cadences with steps of 1 or more resolve as before.
- list/pause/resume/delete behave; pause skips ticks; resume recomputes next_run.
- `/schedule delete` by the owner appends `started` then `ok` (action `schedule-delete`, surface `discord:schedule`, args digest only) before the schedule and its runs are gone; the reply names both row numbers and the chain verifies.
- When the audit trail throws, the chain is keyed and the process has no key, or no trail is wired, `/schedule delete` replies `audit log unavailable (SAFE-5)` and the schedule and its run history are kept.
- A non-ADMIN `/schedule delete` gets `not authorized` and appends `denied`; a delete that throws after the `started` row appends `error` and says so.
- Optional create `channel` must be allowlisted; tick re-checks before post.
- A due schedule whose creator is on `denyUsers` is refused at tick: no agent run, no post, the run is recorded failed with `creator not allowlisted: …`.
- With a non-empty user allowlist, a schedule by an unlisted creator is refused; one by a listed user or by the configured owner (not on the list) still runs and posts.
- A creator deny-listed while their run is in flight gets no post.
- Refused-creator ticks count toward the 5-failure auto-pause.
- With empty user and role lists a schedule by any creator still runs (channel-gated only).
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
