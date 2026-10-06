---
change: i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c
artifact: design
---

# Design

- **Scheduler (`service.ts`).** New optional `runStop: ScheduleRunStop`.
  `runOne` calls `beginStop(schedule)` right before `agent.runChat`
  (after the gates, the SAFE-13 scan, the worktree and the prompt; the channel
  re-checked with `gateTick`; a throw logged as `stop control`), and passes
  `AbortSignal.any([signal, handle.signal])`. After `runChat` it awaits
  `handle.finish()`; a stopper with the abandon signal still unset goes to
  `recordStopped` (`finish(..., { ok: false, stopped: true, summary:
  "stopped", error: "stopped on Discord by <id>" })`, a log line, the spend
  DM) and returns before any post. The catch path does the same when a stopped
  run's client threw; `finally` calls `finish()` again (idempotent) before
  parking the worktree. `finish()` (the private recorder) with `stopped`
  passes no ask and no `autoPause`, and skips `maybeAutoPause`.
- **Store (`store.ts`).** `markRunFinished` takes `stopped`: status
  `failed`, no ask, and the SQL count `CASE WHEN ok THEN 0 WHEN stopped THEN
  consecutive_failures ELSE +1` in the same IMMEDIATE transaction. No schema
  change: `failed` / summary `stopped` is `/work`'s existing shape.
- **Stop control (`src/discord/schedule-stop.ts`, new).**
  `createScheduleRunStop(deps)` → `{ begin, inOwnerDm }`. Channel: enqueue
  a `schedule_<id>` turn (creator as requester, the channel), a
  `ThinkingStatus` with `buildStopComponents(runId)` and the line
  `⏳ <title>: running.`, `setProgressMessage`; end: `fail("⏹ Stopped")`
  or `discard()`. No channel: `sendDm` the owner the line, enqueue with the
  DM channel id, `editMessage` to add the button (the run id exists only
  after the enqueue, the channel id only after the send), `setProgressMessage`,
  remember the run id as a DM run; end: edit to `⏹ Stopped` /
  `components: null` or `deleteMessage`. The handle's `finish` reads
  `stopReason` / `stoppedBy` and calls `turn.done()` synchronously before
  the first await, so the stop window closes with the run.
- **Bridge.** Builds one control after its `SessionRunControl` and passes it
  to `SchedulerService`. `pressStopButton` passes `{ inDm }` to
  `pressPassesGates` only for a press with no guild on a found running turn
  that `inOwnerDm` knows; `pressPassesGates` then skips just the channel
  gate. The `stop_run` route and the stop ack are unchanged
  (`store.get` of a schedule session is undefined, so nothing is tracked).
- **Rejected.** A new `cvstop-schedule:` prefix or stop store (a second
  mechanism); a SQLite stop request so the daemon's runs could be stopped (a
  schema change, and the daemon has no Discord post to stop from); a new
  `stopped` run status (no reader needs it; `/work` already uses
  `failed` / `stopped`); live tool status on the schedule's progress embed
  (not asked).
