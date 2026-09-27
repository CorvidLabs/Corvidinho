---
module: discord
change: schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live
---

# Delta — discord (schedule ticks re-check the creator against the live actor gate)

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

Cadence SHALL enforce a minimum interval of **5 minutes** at create time.
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
- list/pause/resume/delete behave; pause skips ticks; resume recomputes next_run.
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
