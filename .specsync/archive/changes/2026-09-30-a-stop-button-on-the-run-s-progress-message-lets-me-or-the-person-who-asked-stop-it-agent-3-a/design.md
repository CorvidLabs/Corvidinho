---
change: a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a
artifact: design
---

# Design

- **`run-control.ts`.** New exports only: `RUN_STOP_PREFIX` (`cvstop`),
  `RUN_STOP_LABEL`, `RUN_STOP_NOT_YOURS`, `RUN_STOP_NOTHING_RUNNING`,
  `stopRunCustomId` / `parseStopRunCustomId` (`cvstop:run_<n>`, exactly two
  parts, so `cvstop-schedule:…`, `cvok:…`, `cvask:…` parse as null) and
  `buildStopComponents(runId)` (one action row, one style-4 button). The
  queue, `stop`, `byProgressMessage` and the run ids are unchanged.
- **`ThinkingStatus`.** Optional `components`: sent with the progress embed
  (`sendEmbed`), or on a reused stub in place of `components: null`
  (`editMessage`, else `editEmbed`); working edits send no `components`
  (Discord keeps them); `done` / `fail` edit with `components: null` (only
  when the button was shown, so a status without components edits exactly as
  before); `finalizeContent` already writes `null` (or the answer's own
  components) on the first part; `discard` deletes or clears. The
  `ThinkingOutbound` / gateway `sendEmbed` and `editEmbed` gain optional
  `components` (`null` ⇒ `[]` on the wire; omitted ⇒ untouched).
  `memoryThinkingOutbound` records them.
- **Run paths.** Chat, pick / Answer, `/session start` and `/work` pass
  `buildStopComponents(turn.runId)` to `ThinkingStatus` (slash only when a
  turn exists). `setProgressMessage` already maps the message to the turn.
- **Press.** `onComponent`: after the Approve-card branch and before the ask
  parser, `parseStopRunCustomId`; a form submit with that id is ignored. The
  ask branch's channel / actor / mute-rate block moves verbatim into
  `pressPassesGates(interaction, talk)`, which both branches call. The run is
  `byProgressMessage(interaction.messageId)` when its run id and channel match
  the press (so a button from a finished run or an earlier process, whose
  progress message is no longer mapped, stops nothing); the gate's talk is
  that run's session, else the session the pressed (finished answer) message
  is tracked on, else the press channel alone. Then: no run ⇒ 'Nothing is
  running.'; not requester / owner ⇒ 'This Stop button isn't for you.'; else
  `stopRun` (the one helper `stopRunFor` now uses too: `SessionRunControl.stop`
  + the log line) and the ephemeral `RUN_STOP_ACK` (a race that finds the run
  gone gets 'Nothing is running.').
- **Restart.** `recoverInterruptedReplies` edits the interrupted embed with
  `components: null`, so a dead run's button goes too.
- **Alternatives rejected.** Looking the run up by id alone (`run_<n>` restarts
  at 1 each process, so an old button could stop a new run); a public ack
  (the words' ack is public because the stop message is; a press has a
  private answer); `update`-ing the message on press (the `⏹ Stopped` edit
  follows at once and clears it); a new `editEmbed`-free `done` via
  `editMessage` (more calls change for existing callers).
