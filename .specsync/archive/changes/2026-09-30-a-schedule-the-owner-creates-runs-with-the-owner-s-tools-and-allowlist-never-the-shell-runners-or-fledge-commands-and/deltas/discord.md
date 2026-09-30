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

### REQUIREMENT REQ-discord-476

The agent SHALL be able to attach a file or image (screenshots, logs, diffs,
charts) to its reply in the conversation's channel (DISCORD-17) through the
plugin `discord-send-file`, registered by `loadDiscordPlugins` as dangerous
(SAFE-1 allowlist, SAFE-5 audit through `runPlugin`), mutating (ROLES-CHAT-3:
non-owner, WATCH and other people's schedule runs are refused before it
runs; the owner's own schedule, DISCORD-SCHEDULE-1.a, passes that check and
is refused below because a schedule passes no conversation channel) and
minTier 1.
It SHALL attach only in the channel the bridge set for the run: the spawn
client SHALL always write `CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` and
`CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID` from
`AgentRunChatOpts.replyChannelId` / `replyParentChannelId` (empty when unset,
never inherited); chat, reply-continue and thread runs SHALL pass the
conversation's channel (the thread, with its parent, for a message in a
thread), ask-button runs the session's channel (the thread, with its parent,
for a session a message started in a thread), and `/session start` /
`/work` the command channel alone (so the ask-button runs of their sessions
carry no parent); schedules SHALL pass none. A `--channel` / `-c` argument
SHALL be refused, and a run with no conversation channel or no acting user
SHALL be refused, nothing sent. The channel allowlist SHALL gate first (a
thread as itself or through its parent, DISCORD-5), then the DISCORD-8
requester check SHALL run for the acting user with View Channel, Send
Messages and Attach Files (`verifyRequesterCanSend` option `attachFiles`); a
check that cannot run SHALL refuse. The file SHALL be at most 8 MB (Discord's default upload limit) and
SHALL be a PNG, JPEG, GIF or WebP image whose magic bytes match its extension,
or UTF-8 text with a `.txt`, `.log`, `.md`, `.diff`, `.patch`, `.json` or
`.csv` extension; text (and the optional caption) SHALL be secret-scrubbed
(SAFE-6: vendor-key shapes and set secret env values, `redactSecretEnvValues`)
before upload, and the caption SHALL parse no mentions (REQ-discord-205).
SAFE-2 protected paths (`.env*`, `.git`, `fledge.toml`, `.fledge/`,
`bunfig.toml`, `specs`, `*.spec.md`, keystores), any `.specsync` path and
secret paths (`.ssh`, keys, credentials) SHALL be refused, judged on the path
as given and on where it resolves inside the project root with symlinks
followed; a path that leaves the project SHALL be refused. `--git-diff
[--staged]` SHALL attach the worktree (or index) diff as `changes.diff`
(`staged.diff`) with secret paths excluded (a secret path that slips through
refuses) and the text scrubbed, so a large diff goes as a `.diff` attachment.
A Discord 413 / code 40005 answer SHALL be reported as over the server's
upload limit, not retried. `CORVIDINHO_DISCORD_DRY_RUN=1` SHALL post nothing.
No slash command, config key, table or column is added; the two env vars are
bridge-to-run plumbing.

A conversation thread on `deny_channels` SHALL be refused even when its
parent is allowlisted (deny wins, REQ-discord-212 / REQ-plugins-005), before
the requester check, with the `checkChannel` "is denied" error; nothing is
uploaded.

The conversation's channel SHALL pass the gate the bridge serves it by:
`isMonitoredConversation` on the bridge's channel set (allowlist file and
`CORVIDINHO_DISCORD_ALLOW_CHANNELS` union `DISCORD_CHANNEL_IDS`,
REQ-discord-212 / REQ-discord-004). A thread allowlisted by its own id SHALL
pass even when its parent is not listed, and a thread SHALL be refused when
it, or the parent the bridge set, is on `deny_channels` (deny wins,
REQ-plugins-005), before
the requester check, nothing uploaded. The file SHALL be read once, from one
descriptor opened without following a link at the checked path, and the file
that descriptor holds SHALL be a regular file whose own path is inside the
project and is not a SAFE-2 protected, `.specsync` or secret path: a file or
folder swapped for a link after the path checks SHALL be refused (SAFE-2).
The 8 MB cap SHALL hold for the bytes read as well as for the size first
taken, and no more than the cap + 1 byte SHALL be read: a file that grew
past the cap after its size was taken SHALL be refused before the requester
check, nothing uploaded. An ask-button run of a session a message started in
a thread SHALL carry the thread as the reply channel and its parent.

Acceptance Criteria
- `discord-send-file` is registered dangerous, mutating, minTier 1; its description says it can attach and never to say it can't.
- SAFE-1 denies it when not allowlisted; a non-owner run is refused (ROLES-CHAT-3) before any check or upload.
- In the owner's own scheduled run (owner stamp, `schedule_*` session, no reply channel) it passes the role check and is refused as a run with no conversation channel, nothing sent (`tests/scheduler.owner-role.test.ts`).
- A PNG is uploaded to the run's channel as `image/png`, bytes unchanged, `allowed_mentions.parse = []`, after a requester check for the acting user with `attachFiles`.
- A text log is uploaded with vendor keys and the bot token value redacted; the caption is defanged and scrubbed.
- `--channel` / `-c` / `--channel=` and a run with no conversation channel or acting user are refused, nothing uploaded.
- A channel off the allowlist is refused; a thread passes through its allowlisted parent.
- `.env*`, `.git`, keystore, `.specsync`, `specs/`, `.ssh`, `fledge.toml`, symlinks to protected files, symlinks out of the project and outside paths are refused.
- Disallowed types, image bytes that do not match the name and non-UTF-8 text are refused; over 8 MB is refused before any upload; a 413 / 40005 is reported.
- A requester who cannot attach, or a check that throws, sends nothing; dry run uploads nothing; `started` and `ok` audit rows are written.
- `--git-diff` refuses an empty diff and attaches `changes.diff` without secret paths and scrubbed.
- The spawn client writes the reply channel env (empty when none); the bridge passes the conversation's channel on chat, thread, `/session start` and `/work` runs.
- A deny-listed thread under its allowlisted parent is refused with the "is denied" error: no requester check runs and nothing is uploaded; another thread under that parent still passes.
- A thread allowlisted by its own id, its parent not listed, attaches in the thread after the acting user's check; with the parent the bridge set deny-listed it is refused ("is denied"); a deny-listed thread under an allowlisted parent is refused ("is denied"); an unlisted thread under an unlisted parent is refused (not allowlisted); nothing else is checked or uploaded.
- A file whose size, as first taken, is under 8 MB but which is over it when read is refused with the upload-limit error after at most 8 MB + 1 byte is read: no requester check runs and nothing is uploaded.
- A checked file swapped for a link to `.env`, or whose folder is swapped for a link into `.ssh`, after the path checks is refused (SAFE-2): no requester check runs and nothing is uploaded.
- An ask-button pick for a session a message started in a thread resumes with `replyChannelId` = the thread and `replyParentChannelId` = its parent; a pick for a `/session start` session in a thread resumes with `replyChannelId` = the thread and no `replyParentChannelId`.
- A file under `.fledge/` (`.fledge/lanes/notes.md`) and a link to it are refused like the rest of the SAFE-2 set (SAFE-2.a); nothing is uploaded (fails on main's `isProtectedPath`).
