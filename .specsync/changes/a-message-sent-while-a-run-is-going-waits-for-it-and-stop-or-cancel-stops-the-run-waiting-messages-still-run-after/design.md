---
change: a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after
artifact: design
---

# Design

- **`SessionRunControl` (new `src/discord/run-control.ts`).** A per-session
  promise chain: `enqueue` appends a turn whose `ready` resolves when every
  earlier turn of the session is `done` (at once, synchronously marked
  running, when the session is free); FIFO; sessions independent. Each turn
  has an `AbortController`, a list of progress message ids mapped to it while
  it runs, `stopReason` (`stopped` | `closed`), `stoppedBy`, and a
  `requesterForgotten` flag from a per-user forget epoch. `stop(runId)` aborts
  a running turn once (`already` after that, `none` when it is not running);
  waiting turns are never stopped or dropped (AGENT-3.b). `close()` aborts the
  running turns (`closed`) and makes every waiting or later `ready` false;
  `settle(ms)` waits for open turns. `onStopped` runs after a stopped turn is
  done. In memory only.
- **Router.** `RouterDeps.runs` (the control's `byProgressMessage`);
  `stopRunRoute` right after the own-channel gate: a reply whose body
  (`promptBodyForAskGate(stripMentions(...))`) is exactly stop/cancel to a
  running turn's progress message, in that message's channel, from its
  requester or the owner, then `refuseActor` and `refuseRateOrMute` →
  `{ kind: "stop_run", runId, sessionId }`; anything else falls through
  unchanged.
- **Bridge chat path.** `stop_run` → `stopRunFor` (stop, one ack tracked on the
  run's session). A `continue_session` whose body is stop/cancel while
  `current(session)` exists → the same. Otherwise `enqueue`; a turn that must
  wait gets its in-flight row now; after `ready` (false ⇒ `keep()` the row and
  return) a waited turn whose session is gone or requester forgotten returns;
  the rest of the old body runs inside the same try (re-indented), with
  `inflight ??= trackInflight(...)`, `setProgressMessage`, `signal:
  turn.signal`, and after the run: `closed` ⇒ `keep()` + dispose, no post;
  `stopped` ⇒ no ask, body `RUN_STOPPED_TEXT`, failed status/colour, same
  footer extras; `finally` ends the row and `done()`s the turn.
- **Pick / Answer path.** The same turn around the resumed run, taken after
  the pick is claimed and acked (Discord's 3 s), before the thread replay; the
  row is recorded before it waits; a skipped turn deletes the "Got it"
  ephemeral.
- **Slash.** `SlashContext.runControl`; `/session start` and `/work` enqueue
  after their session exists and move the run into `runSessionStart` /
  `runWork` (same code, no re-indent) inside `try/finally done()`. A stopped
  run's `result` loses its `ask` and `ok`; `/session` answers its head lines +
  `⏹ Stopped`; `/work` records `failed` / `stopped` and the PR line
  `WORK_STOPPED_PR_REASON`; `closed` posts nothing.
- **Bridge stop.** `runControl.close()` first, `settle(ABANDONED_SETTLE_MS)`
  before the gateway stops.
- **Cards.** `onStopped` → `approvals.deliver()`: the killed run's card is
  orphaned and closes as a no in that pass.
- **Alternatives rejected.** A "waiting" indicator (m34 default: none);
  dropping waiting messages on stop (AGENT-3.b says they run); a new
  `WorkTaskStatus` (touches the loader and `/status`); moving the whole chat
  body into a new function (bigger diff than re-indenting the part before the
  existing `try`).
