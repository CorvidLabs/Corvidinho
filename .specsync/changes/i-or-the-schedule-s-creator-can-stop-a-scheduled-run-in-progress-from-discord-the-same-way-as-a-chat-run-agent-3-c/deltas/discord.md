---
module: discord
change: i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c
---

# Delta: discord (I or the schedule's creator can stop a scheduled run in progress from Discord, the same way as a chat run — AGENT-3.c)

## Added

### REQUIREMENT REQ-discord-304

I or the schedule's creator can stop a scheduled run in progress from
Discord, the same way as a chat run (AGENT-3.c, captured in `hi/agent.md` in
this change's PR from Leif's 2026-09-28 interview, round 13 of that record,
2026-09-30). `SchedulerServiceOpts` SHALL gain an optional `runStop`
(`ScheduleRunStop`: `begin({ scheduleId, creatorId, channelId?, title })`
resolving a `ScheduleRunStopHandle` — its `signal` and an idempotent
`finish()` that resolves who stopped the run — or null), and the bridge SHALL
wire it to `createScheduleRunStop` (`src/discord/schedule-stop.ts`) over its
own `SessionRunControl` (REQ-discord-301), `resolveOutbound()`, the gateway's
`sendDm` / `editMessage` / `deleteMessage` and the configured owner. The
daemon passes none: its runs have no Stop control and run as before.

- `runOne` SHALL call `begin` once per run, after the DISCORD-SCHEDULE-3
  gate, the SAFE-13 scan, the worktree and the prompt, just before
  `agent.runChat`, passing the schedule's channel only while `gateTick` still
  passes (a refused channel gets no control). A `begin` that throws SHALL be
  logged (`[scheduler] stop control failed: <scrubbed line>`) and, like
  null, leave the run without a Stop control. The run's agent SHALL get
  `AbortSignal.any([<its abandon signal>, handle.signal])`.
- `createScheduleRunStop.begin` SHALL take a turn on the bridge's
  `SessionRunControl` (`enqueue`: session `schedule_<scheduleId>`, requester
  the schedule's creator); a schedule never runs twice at once, so it never
  waits, and a closed control (the bridge stopping) gives null. With a
  channel it SHALL send the run's progress message — a `ThinkingStatus`
  embed `⏳ <scheduleTitle>: running.` (`scheduleRunProgressText`; the
  configured model in its footer) carrying the run's Stop components
  (`buildStopComponents(runId)`, REQ-discord-303) — and map it to the turn
  (`setProgressMessage`). With no channel it SHALL DM the configured owner the
  same line (`sendDm`), take the turn with the DM's channel id, add the Stop
  components to that DM (`editMessage`) and map it to the turn; no owner, no
  DM, or a failed edit gives null (a sent DM is deleted and the turn
  released). The progress message is fixed harness text: no Approve card and
  no AUTONOMY-10.a hold.
- The Stop press (REQ-discord-303's `cvstop` branch) and the stop words
  (REQ-discord-302's `stop_run` route: a reply to the progress message in its
  channel) SHALL work on that turn unchanged: from the schedule's creator (in
  the requester's place) or the configured owner they stop it through
  `SessionRunControl.stop` (its signal aborted once, the agent's process tree
  killed) with `⏹ Stopping the run.`; anyone else's press gets `This Stop
  button isn't for you.` and the run goes on, and anyone else's reply routes
  as before. A press with no guild on a running turn whose button is in the
  owner's DM (`inOwnerDm`) SHALL skip only the channel gate
  (`pressPassesGates` `{ inDm }`), keeping the actor and mute / rate gates;
  every other press keeps the channel gate. The bridge reads no DM text, so
  in a DM only the button stops the run.
- After `runChat` returns (or throws), `runOne` SHALL `finish()` the handle
  before it records or posts anything: `finish` reads who stopped the turn
  and releases it at once (`done`, which runs the after-stop Approve-card
  pass, SAFE-20), so a later press or reply finds nothing running; then it
  edits a stopped run's progress message to `⏹ Stopped` with its components
  cleared (`ThinkingStatus.fail`; in a DM `editMessage` with `content:
  "⏹ Stopped"` and `components: null`) and deletes any other run's
  (`ThinkingStatus.discard`; the DM by `deleteMessage`). A failed edit or
  delete is logged and never fails the run. `runOne`'s `finally` calls
  `finish` again (a no-op).
- A run a person stopped — unless it was abandoned at shutdown meanwhile,
  whose record stands — SHALL be recorded once as `finish(..., { ok: false,
  stopped: true, summary: "stopped", error: "stopped on Discord by <user
  id>" })` (`SCHEDULE_RUN_STOPPED_SUMMARY`, `scheduleRunStoppedError`):
  `ScheduleStore.markRunFinished` writes the row `failed` with that summary
  and error and no ask, and leaves `consecutive_failures` as it is, in the
  same IMMEDIATE transaction; `finish` neither auto-pauses nor returns an ask.
  It SHALL post nothing else (no ✅ / ❌ line, no question, no DISCORD-3.b
  failure DM), still hand a spend warning to the owner's spend DM
  (SAFE-14.a), and log `[scheduler] run <run id> of schedule <id> stopped on
  Discord by <user id>`. The stop ends that run only: the schedule stays as
  it is (its `next_run_at` was set when the run was claimed), so its next due
  run goes ahead as usual.
- No new env var, config key, slash command, table, column or schema
  version.

Acceptance Criteria
- `tests/discord.schedule-stop.test.ts`: through a dry-run bridge, a due schedule's run sends one progress embed `⏳ Schedule **<name>** … running.` to its channel with one red `Stop` button `cvstop:run_<n>`, and its agent gets a signal and the `schedule_<id>` session; a third user's press gets only `This Stop button isn't for you.` and aborts nothing; the creator's press gets only `⏹ Stopping the run.` and aborts the run once; the row is `failed` / `stopped` / `stopped on Discord by <creator>` with no ask, the schedule `active` with its failure count 0 and its next run in the future; the progress message ends `⏹ Stopped` with `components: null`; nothing is posted; a later press gets `Nothing is running.`; the next due run gets its own button, posts its ✅ result and its progress message is deleted.
- Same file: the owner's `Cancel!` reply to the progress message of someone else's schedule run stops it (one ack reply to the stop message; the row stopped by the owner; no session of the owner's); a third user's `stop` reply does nothing.
- Same file: a schedule with no channel DMs the owner the line, then adds the Stop button to that DM; the owner's press there (no guild) stops it and the DM is edited to `⏹ Stopped` with `components: null`; the next run, which ends on its own, has its DM deleted; nothing goes to a channel. The same message pressed in a guild channel off the allowlist stops nothing.
- Same file, `SchedulerService` with a fake control: at `FAILURE_AUTO_PAUSE - 1` failures a stopped run keeps the count, the schedule stays `active`, the question the stopped run raised is not stored or posted, and the control is finished once; a run nobody stopped finishes the control before its ✅ post; a `begin` that throws is logged and the run goes on; a run abandoned at shutdown stays `interrupted: bridge shutdown` even when the control reports a stop.
- Same file, `createScheduleRunStop`: no owner or no DM gives null; a DM whose button edit fails is deleted and its turn released; a channel run's turn is `schedule_<id>` / the creator / the channel, `SessionRunControl.stop` aborts the handle's signal, and `finish` resolves the stopper (twice), releases the turn and edits `⏹ Stopped` with `components: null`.
- With the base's sources (the branch's new `schedule-stop.ts` kept) the bridge and `SchedulerService` tests fail; the two `createScheduleRunStop` units (the new module) pass on both.

## Modified

### REQUIREMENT REQ-discord-302

In Discord I can stop a run by saying stop or cancel, and so can the person
who asked (AGENT-3.a; AGENT-3: it actually stops instead of finishing in the
background); after I stop a run, messages that were waiting still run, in
order (AGENT-3.b). This requirement is the stop words; the Stop button
(AGENT-3.a) on the progress message is REQ-discord-303, which stops a run
through the same stop, and stopping a schedule's run from Discord (AGENT-3.c)
is REQ-discord-304, whose runs these words stop the same way (the schedule's
creator in the requester's place). A
message whose whole text (mentions and the IDENTITY-5 mention trailer left
out, any case, trailing `.` / `!` allowed; `isStopRunText`) is 'stop' or
'cancel' SHALL stop the run in flight when it comes (a) from the requester in
their session — the router gives `continue_session` for their own session and
a turn of that session is running — or (b) as a reply to that run's progress
message (the chat progress message, the Choose stub a pick resumed in, or the
`/session start` / `/work` progress message), in that message's own channel,
from the run's requester or the configured owner (IDENTITY-1): the router's
`stop_run` route, checked right after the channel gate and before the thread
and bot-message lookups (REQ-discord-002's exception), past the actor gate
(REQ-discord-201) and the mute/rate gate (REQ-discord-010). The stop SHALL
never wait in the session's queue. `SessionRunControl.stop` SHALL abort the
running turn's signal once (idempotent; a second stop while it winds down
aborts nothing more), which kills the run's whole process tree through the
spawn client (`killProcessTree`); a waiting turn is never stopped or dropped,
so the messages that were waiting still run afterwards, in order. Each stop
message SHALL get one short reply, `⏹ Stopping the run.` (`RUN_STOP_ACK`),
tracked on the run's session. The stopped run's answer SHALL be
`⏹ Stopped` (`RUN_STOPPED_TEXT`), edited into its progress message (or, with
no editable message, the fallback status and reply) with the DISCORD-15 /
15.a footer — the model and time for everyone, tokens and cost only on the
owner's own runs — in the error color; a question the stopped run raised is
dropped (never stored as a pending ask or posted), `⏹ Stopped` joins the
session's thread as the answer, the stop message itself does not, and on the
chat path a free-text pending ask is cleared as after any turn that asks
nothing. A stopped
`/session start` answers its head lines and `⏹ Stopped`; a stopped `/work`
SHALL be recorded `failed` with the summary `stopped`, SHALL open no PR (`PR:
not opened — the run was stopped.`) and answers `⏹ Stopped`. A stop that
lands after the `/work` agent exited but before its PR step SHALL still open
no PR (the same PR line; a run that had finished cleanly is recorded `failed`
/ `stopped`). After a stopped
turn finishes the bridge SHALL run an Approve/Deny card pass, so a card the
killed run was waiting on (its waiting process gone) closes as a no at once
(SAFE-20; otherwise on the engine's next poll). With no run of the session in
flight the words SHALL keep today's behaviour: 'cancel' clears the open asks
(AUTONOMY-6, REQ-discord-044) and 'stop' is an ordinary message; anyone else's
reply to a progress message routes as before. No new env var, config key,
slash command, table or schema change.

Acceptance Criteria
- The requester's 'stop' in their thread while its run is going: the run's signal is aborted once, one `⏹ Stopping the run.` reply to the stop message, the progress message becomes `⏹ Stopped` with a footer-only error embed `<model> | <time>`; `⏹ Stopped` is in the session's thread and `stop` is not.
- The owner's own stopped run shows `<model> | <tokens> tokens | $<cost> | <time>`.
- 'cancel' as a reply to the running progress message (not a tracked bot message) stops it.
- The owner's 'stop' reply to someone else's running progress message stops it and starts no session of the owner's; a third user's 'stop' reply stops nothing and gets no reply.
- A second 'stop' while the run winds down aborts nothing more: one abort, one `⏹ Stopped`, one ack per stop message.
- Two messages waiting behind a stopped run run after it, in order, and are not aborted.
- With nothing running, 'cancel' clears an open ask with `ASK_CANCELLED_ACK` and 'stop' runs the agent with the text 'stop'.
- A pick's resumed run stops by a 'stop' reply to its Choose stub.
- `/session start` and `/work` stop by a 'stop' reply to their progress message; the stopped `/work` answer says `PR: not opened — the run was stopped.` and the task is `failed` / `stopped`.
- A 'stop' reply that lands after the `/work` agent exited (while its private reply's DM is still going out) gets the ack; the answer says `PR: not opened — the run was stopped.` and the task is `failed` / `stopped`.
- 'cancel' while a chat run is going and a button ask of the session is open stops the run with the stop ack only and leaves that ask pending.
- The real spawn client over a fake agent bin: the agent process and the background process it started are both gone after the stop.
- A fake agent bin that raised a must-ask Approve card (itself the waiting process) and waits: after the stop the card's request is `expired` (closed as a no).
- `routeMessage`: a reply 'stop' / '<@bot> cancel' to a running progress message that is also a tracked bot message gives `stop_run` for the requester and the owner; 'stop it', a third user, the same reply in another allowlisted channel, or a finished run route as before; a deny-listed requester is refused quietly.
- `isStopRunText`: true for `stop`, `Stop`, ` STOP. `, `cancel`, `Cancel!`, `stop!!`; false for `stop it`, `please stop`, `cancel that`, `stopped`, empty, `nevermind`, `don't stop`.
- A Stop press (REQ-discord-303) and a 'stop' reply to the same running progress message go through the same `SessionRunControl.stop`: the run is aborted once and the reply still gets its `⏹ Stopping the run.` ack.
- A 'stop' / 'cancel' reply from a schedule's creator or the owner to the progress message of a running schedule run routes `stop_run` and stops it through the same `SessionRunControl.stop` (REQ-discord-304).

### REQUIREMENT REQ-discord-303

In Discord I can stop a run with a Stop button, and so can the person who
asked (AGENT-3.a, captured in `hi/agent.md` from Leif's 2026-09-28
interview); after I stop a run, messages that were waiting still run, in
order (AGENT-3.b). The progress message of every chat run, ask pick or Answer
form resume, `/session start` and `/work` run SHALL carry, while the run
goes, one message component row with exactly one danger-style (red, style 4)
button labelled `Stop` whose custom id is `cvstop:<runId>` (the run's
`SessionRunControl` turn id; `buildStopComponents`, `stopRunCustomId`,
`parseStopRunCustomId`, `src/discord/run-control.ts`), through the optional
`components` of `ThinkingStatus`, `ThinkingOutbound.sendEmbed` and the live
gateway's `sendEmbed` (the in-memory outbound records them); on a reused
Choose or Answer stub (DISCORD-ASK-7) the Stop button SHALL take that
button's place for the run. Working edits SHALL leave it. The button SHALL be
cleared when the run is done, failed or stopped: the answer's edit
(`finalizeContent`: no components, or the answer's own Choose / Answer
button), the done / fail status edit (`editEmbed` with `components: null`,
which the live gateway sends as an empty list; also when the run throws), a
discarded progress message, and the restart's interrupted notice for a
progress message a dead process left (REQ-discord-311). A progress message
without components is edited exactly as before.

A press of the Stop button SHALL be handled in its own `onComponent` branch
(apart from the Approve cards' `cvok:`, the asks' `cvask:` and any other
prefix such as a later `cvstop-…`); a form submit carrying a Stop custom id is
ignored. The press SHALL pass, in order, the channel gate
(`componentChannelAllowlisted`, REQ-discord-212: the press channel and the
pressed message's talk — the session of the run that message shows while it
runs, else the session its finished answer is tracked on, else the press
channel alone), the actor gate (REQ-discord-201) and the mute / rate gate
(REQ-discord-010), with the same ephemeral refusals as an ask press (the
zero-width ack, the owner's allowlist tip, `MUTED` / `RATE_LIMITED`);
refused, it stops nothing. The run it may stop is the one the pressed message
shows running (`byProgressMessage`), in the press's channel, with the pressed
id; for anything else (a finished or stopped run's button, another run's id,
another channel, a button from before a restart) the press SHALL get only
the ephemeral `Nothing is running.` and stop nothing. From anyone but that
run's requester or the configured owner (IDENTITY-1) it SHALL get only the
ephemeral `This Stop button isn't for you.` and the run goes on. From the
requester or the owner it SHALL stop the run through the same
`SessionRunControl.stop` as the stop words (REQ-discord-302: its signal
aborted once, the process tree killed, idempotent) and answer with the
ephemeral `⏹ Stopping the run.`; the stopped run then ends as REQ-discord-302
says (`⏹ Stopped` with the DISCORD-15 / 15.a footer, no question, a stopped
`/work` failed with no PR, the card pass). A second press, or a 'stop' reply,
while it winds down aborts nothing more and gets the same ack. Messages that
were waiting still run afterwards, in order, each with its own button
(AGENT-3.b). A schedule run's progress message (AGENT-3.c, REQ-discord-304)
carries the same button and a press on it takes this same path, the
schedule's creator in the requester's place; only a press with no guild on
the running turn of a schedule with no channel, whose button is in the
owner's DM (`inOwnerDm`), skips the channel gate (`pressPassesGates` with
`inDm`), keeping the actor and mute / rate gates; every other press keeps it.
No new env var, config key, slash command, table or schema change.

Acceptance Criteria
- A chat run's progress message is sent with one row holding one red `Stop` button (`cvstop:run_<n>`); working edits carry no components; the requester's press gets only the ephemeral `⏹ Stopping the run.`, aborts the run once, posts nothing public, and the progress message becomes `⏹ Stopped` with `<model> | <time>` in the error colour and its components cleared; a later press gets `Nothing is running.`.
- A third user's press gets only `This Stop button isn't for you.` and the run goes on; the owner's press on someone else's run stops it and starts no session of the owner's.
- A finished run's answer clears its button; its button afterwards, the live run's id on another message, another run's id on the live message, the live button pressed in another allowlisted channel and a pre-restart button in the allowlisted channel all get `Nothing is running.` and abort nothing; a pre-restart button in a thread no session is known for gets the zero-width ack.
- A failed run's answer clears the button, and so does the failure status when the run throws.
- With the run's thread deny-listed, a press gets the zero-width ack (the owner: the allowlist tip); deny-listed, the zero-width ack; muted, `MUTED`; none of them stops the run; a form submit with the Stop id gets nothing and stops nothing; past the gates the press stops it.
- A second press, and a 'stop' reply, while the run winds down get the ack and abort nothing more: one abort, one `⏹ Stopped`.
- After a Stop press two waiting messages run in order, each with its own Stop button (three distinct ids), and every progress message ends with its components cleared.
- A pick's resumed run: the stub's Choose button is replaced by the Stop button, a press stops the run, and `⏹ Stopped` clears it.
- `/session start` and `/work`: the progress message carries the button; a press stops the run; a stopped `/work` says `PR: not opened — the run was stopped.` and is `failed` / `stopped`.
- The restart's interrupted notice edits the progress message with `components: null`.
- `ThinkingStatus`: components go out with the progress embed (or on a reused stub, by `editMessage` else `editEmbed`), working edits leave them, `done` and `fail` send `components: null`, the collapsed answer carries none or the answer's own; without components no call carries a `components` field and a reused stub's button is still cleared.
- `parseStopRunCustomId`: `cvstop:run_7` gives `run_7`; `cvstop-schedule:run_7`, extra parts, a missing or malformed id, an ask's or a card's custom id give null.
- With the base's sources these tests fail; they pass on the branch.
- A schedule run's Stop button: the creator's or the owner's press stops it, anyone else's gets `This Stop button isn't for you.`; the owner's press in a DM (no guild) on a no-channel schedule's running turn passes without the channel gate, and the same message pressed in a guild channel off the allowlist stops nothing (REQ-discord-304).
