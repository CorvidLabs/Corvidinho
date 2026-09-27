---
change: schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the
artifact: design
---

# Design

- `ScheduleStore.markRunFinished(schedule, run, result)`: `result` gains
  optional `autoPause: { at: number; ask: HumanAsk }`. Inside the existing
  IMMEDIATE transaction, after the SQL `consecutive_failures` update, the
  run row stores `autoPause.ask` (scrubbed, capped) instead of
  `result.ask` when the run failed and the SQL count is `>= at`; the
  memory store uses its own count. The decision uses the same count
  `maybeAutoPause` then reads, so the ask and the pause agree even when a
  cached row is stale (two tickers). No new column: `ask_reason` /
  `ask_question` / `ask_posted_at` from schema v11.
- `SchedulerService`:
  - exports `PROJECT_RESOLVE_FAILED_QUESTION`, `WORKTREE_FAILED_QUESTION`
    (fixed, path-free text) and `autoPauseAsk(last?)` (pause line +
    `/schedule resume`, plus `Last failure: <question>` of the run's own
    ask);
  - `finish()` passes `autoPause: { at: FAILURE_AUTO_PAUSE, ask }` for a
    failed run and returns `null` (already recorded) or `{ ask? }`: the
    auto-pause ask when `maybeAutoPause` paused, else the run's own ask;
    `onRunFinished.askReason` follows it;
  - `failBeforeRun` records the two pre-run failures with the full error
    and a stuck ask, then posts it (a resolve / worktree step that throws
    is caught into the same branch); `postOwnRunAsk` is the in-process post
    of REQ-discord-347 (live gate, take the recorded ask, `postRunAsk`),
    now shared by the pre-run branches, the normal path and a run that
    throws. The normal path posts `done.ask` when there is one, else the
    ✅/❌ line as before; for a pause ask of a run without its own ask the
    context is the `failed (exit N)` line the ❌ post showed. `finish()`
    also returns `autoPaused`, and `postOwnRunAsk({ handBack })` releases a
    pause ask whose post did not go out, so the next delivery pass retries
    it (a paused schedule has no next run; other own-run asks keep the
    REQ-discord-347 "not retried" rule).
- Daemon and bridge wiring are unchanged: the daemon already logs
  `run.needs_human` from `askReason`, the bridge's delivery pass already
  posts any pending run ask.
- Rejected: a separate post or a new DM/channel for the pause (the captured
  text only asks for the owner ping; REQ-discord-347 already routes stuck
  asks to the owner); writing the pause ask in a second statement after the
  run-finish write (another ticker could take the run's own ask in between,
  so the owner would get two posts); predicting the pause from the cached
  failure count (a stale cache would pause silently again); posting the
  resolve / worktree error text (host paths, REQ-discord-418); a new config
  key for the threshold or the text (not captured).
