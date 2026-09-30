---
module: discord
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
---

# Delta: discord (the owner's own schedule runs as the owner, read live; others' stay read-only, DISCORD-SCHEDULE-1.a)

## Added

### REQUIREMENT REQ-discord-741

A schedule the owner creates runs as the owner; schedules other people create
stay read-only (DISCORD-SCHEDULE-1.a, #124). `SchedulerServiceOpts` SHALL
gain an optional `loadOwner` (`() => Promise<OwnerRecord | null> |
OwnerRecord | null`), read once per run: the bridge SHALL wire it to
`loadOwnerConfig({ env, filePath: <the loaded allowlist's source path> })`
and the daemon to `loadOwnerConfig({ env })` (REQ-cli-741), so a run reads
the owner as configured now; without it the start-time `owner` is used, and a
read that throws SHALL be logged (`[scheduler] owner failed: <scrubbed
line>`) and count as no owner (fail closed).

- `runOne` SHALL, after the DISCORD-SCHEDULE-3 creator / channel gate
  (REQ-discord-020) and before the SAFE-13 scan, resolve the creator's role
  against that live owner (`resolveDiscordActingRole` with the live owner, the
  live mute set and the people list read with that owner; the SAFE-12 fence
  and the answered-ask block use the same owner) and spawn the run with
  `actingIsAdmin: true` only when that role is `owner` and
  `isOwnerDiscord(liveOwner, schedule.createdByUserId)` — the owner as
  configured now, not muted or deny-listed. Every other schedule SHALL be
  spawned with `actingIsAdmin: false`. No schedule SHALL pass `actingRole`,
  so the spawn client stamps `owner` or `community`, never `team`.
- The run keeps `surface: "schedule"` and its `schedule_<id>` session id, so
  the SAFE-3.a gate still refuses the shell, runners and Fledge runs
  (REQ-agent-503), no Fledge plugin command is discovered (REQ-agent-741), the
  repo gate stays on (DISCORD-SCHEDULE-3.a) and the tool layer re-checks the
  owner at every call (REQ-plugins-065). The owner's schedule is offered the
  dangerous tools the allowlist names; a must-ask call it starts (a
  `discord-post-message` included) raises the owner's Approve card through
  `runPlugin`. A deny, a lapse or a resent deny ends the run with the stuck
  ask `mustAskRefusedAsk` builds (REQ-agent-741); `finish` records it and it
  blocks the schedule (AUTONOMY-6.a, REQ-discord-606): it is posted once to
  the schedule's channel (the owner pinged, with its Answer and Cancel
  controls), and each later due run is skipped with one wait note, raising no
  new card, until it is answered or cancelled.
- The schedule's own posts (its result, its ask, its wait note) SHALL keep
  going out through the scheduler's outbound, never through `runPlugin`, so
  they are not AUTONOMY-10 announcements it starts and need no card.
- An owner schedule on a non-git project SHALL keep its own scoped folder
  (`scoped-talk-schedule_…`), never the project folder itself.
- No new env var, config key, slash option, table, column or schema version.

Acceptance Criteria
- `tests/scheduler.owner-role.test.ts`: the owner's due schedule is spawned `actingIsAdmin: true` with no `actingRole`, surface `schedule`, session `schedule_<id>` and its prompt unfenced, and its result post goes straight to its channel; a declared team member's and a stranger's are spawned `actingIsAdmin: false` with no `actingRole`.
- Same file: started with one owner while `loadOwner` names another, the old owner's schedule is community (fenced `role: community`) and the new owner's runs as the owner, one read per run; `loadOwner` returning null, throwing (logged) or a muted owner give `false`; without `loadOwner` the start-time owner is used.
- Same file: an owner schedule on a non-git project runs in its own `scoped-talk-schedule_…` folder, never the project folder.
- Same file: through the real spawn client, the child of the owner's schedule resolves `owner` (stamps `1` / `owner` / `schedule`, the shell gate refusing "scheduled runs never get them") and a team member's resolves `community`.
- Same file: in process, the owner's schedule's `discord-post-message` raises one `mustask-post` card; denied, the scheduler records the stuck ask naming it, posts it once pinging the owner with its controls, and the next two due ticks run nothing, raise no new card and post one wait note.
- Same file: `startDaemon` and `startBridge` spawn the owner's schedule as the owner, and after the allowlist file names another owner the next run of it is community.
- With the base sources these tests fail; the read-only, owner-chat and other-person guards pass on both.

## Modified

### REQUIREMENT REQ-discord-713

A schedule's text is its creator's words (SAFE-12 / SAFE-13, #71). A
schedule's name, description and prompt SHALL be treated like the same words
in the creator's chat message (REQ-discord-071): the owner's are the
principal's and are neither scanned nor fenced; anyone else's are scanned by
the same detector (`scheduleInjection`, `inboundInjection` over each of the
name, description and prompt, reason ids merged in `INJECTION_REASONS`
order) and reach the model only as untrusted data.

- `/schedule create` SHALL resolve the requester's role before the ADMIN gate
  (`resolveDiscordActingRole` with the requester's Discord role ids, the admin
  lists, the owner, the live mute set and the declared people list, as
  `/work` does). When the requester is not the owner and their `name` or
  `prompt` trips the detector, the create SHALL be refused through
  `refuseInjectedSlash` (source `schedule-prompt`) with the interaction's
  reply ephemeral (every `/schedule` reply is): the requester gets
  `injectionRefusalHead` plus "I've flagged it to the owner" (never the
  text; without an owner or a post function the `formatInjectionRefusal`
  line), the owner one fresh post in the command's channel that pings only
  them ("a /schedule request here looked like a prompt-injection attempt"),
  and the SAFE-5 trail one `injection-suspected` / `denied` row (actor the
  requester, surface `discord:/schedule`, digest of `schedule-prompt` and the
  reason ids). Nothing SHALL be stored. A non-owner create that trips nothing
  gets the ephemeral `NOT_AUTHORIZED` as before (no post, no row). There is no
  other create or edit path for a schedule's text (pause, resume and delete
  take none).
- On every tick, after the DISCORD-SCHEDULE-3 gate (REQ-discord-020) and
  before any worktree or agent run, the scheduler SHALL resolve the creator's
  role again (`resolveDiscordActingRole` with the creator's user id, the live
  allowlist, the owner, the bridge's live mute set when wired
  (`SchedulerServiceOpts.mutedUsers`) and the declared people list re-read
  now; a tick has no Discord role ids; any failure reads as community), so a
  schedule stored before this check, or by someone who is no longer the
  owner, is judged by who its creator is at that tick.
- When the creator is not the owner and the stored name, description or
  prompt trips the detector, the tick SHALL run nothing (no worktree, no
  agent): one `injection-suspected` / `denied` row through
  `SchedulerServiceOpts.recordAudit` when wired (the bridge wires its trail;
  actor the creator, surface `scheduler:<schedule id>`, digest of
  `schedule-prompt` and the reason ids; best effort), the run recorded failed
  (`not run: … prompt-injection attempt (<reason ids>) (SAFE-13)`) with a
  stuck ask whose question is `injectedScheduleQuestion(reasons)` (what
  happened and why in plain words, never the text), the schedule paused (so
  no later tick runs it or posts again; an auto-pause from this failure keeps
  its own pause ask), and that ask posted through the usual schedule ask path
  (REQ-discord-347 / REQ-discord-353: live gate at post time, schedule title
  prefix — `Schedule (<id>) on <project>`, without the name, when the
  creator's stored name itself trips the detector, so the post never quotes
  it — the owner pinged once with allowed mentions the owner only, handed
  back for the next delivery pass when the post does not go out, left pending
  by a ticker with no Discord for a bridge tick to post).
- Otherwise a non-owner creator's run SHALL get the prompt
  `Scheduled work on project: <project>` (no name on that line), the
  worktree line, then `fenceSpeakerText("Schedule \"<name>\":\n<prompt>",
  role, "schedule-prompt")` (the `UNTRUSTED_DATA` fence with a header naming
  the creator's role), then the closing SAFE line; the owner's schedule keeps
  exactly the prompt it had (`Scheduled work "<name>" on project: <project>`
  and the stored prompt as written).
- Schedule runs pass no acting role, and `actingIsAdmin` only for the live
  owner's own schedule (DISCORD-SCHEDULE-1.a, REQ-discord-741; never the
  shell or runners, SAFE-3.a); the creator's role above is resolved against
  the owner as configured at that run (`SchedulerServiceOpts.loadOwner`, else
  the start-time owner); result posts, ask posts, ping keys, auto-pause and
  the delivery pass are otherwise unchanged. `SpeakerSurface` gains
  `schedule-prompt`. No new env var, config key, slash option, table, column
  or schema version.

Acceptance Criteria
- A community user's and a declared team member's `/schedule create` whose prompt (or name alone) trips the detector stores no schedule, gets one ephemeral refusal that never quotes the text, and produces exactly one post in the channel with allowed mentions only the owner and one `injection-suspected` / `denied` row with the user as actor and surface `discord:/schedule` (`tests/scheduler.injection.test.ts`).
- An ordinary non-owner `/schedule create` still gets only the ephemeral `NOT_AUTHORIZED` (no post, no row, nothing stored); the owner's create with injection-like words is stored unscanned.
- A benign community schedule's tick runs with `Scheduled work on project:` and its name and prompt inside the fence (`role: community`, `source=schedule-prompt`), the name nowhere outside it; a declared team member's is fenced as `role: team`, and as `role: community` when muted; the owner's schedule's prompt is exactly as before (no fence) even with injection-like words.
- A stored community (or team) schedule whose prompt or name trips the detector runs no agent, is paused, posts one ask with the schedule title (by id alone, without the name, when the name tripped) that pings only the owner and never quotes the text, and appends one `denied` row (surface `scheduler:<id>`); a later tick posts nothing more.
- A ticker with no outbound (the daemon) leaves that ask pending on the run row and a bridge tick posts it once; through `startBridge` the row lands in the bridge's `audit_log` and the schedule is paused.
- These tests fail on the base sources (the owner and ordinary-create guards pass on both).
- A schedule made by someone who was the owner at start but is not the owner `loadOwner` reads now is fenced as `role: community` and spawned with `actingIsAdmin: false` (`tests/scheduler.owner-role.test.ts`).
