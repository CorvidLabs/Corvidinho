---
change: daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once
artifact: design
---

# Design

- Schema v11 (`src/store/db.ts`): `schedule_runs` gains `ask_reason TEXT`,
  `ask_question TEXT`, `ask_posted_at INTEGER` (additive `ALTER TABLE`, the
  v7/v8/v10 pattern) and a partial index
  `idx_schedule_runs_pending_ask(schedule_id) WHERE ask_reason IS NOT NULL
  AND ask_posted_at IS NULL`. Rows from before v11 have no ask, so an
  upgrade never posts history. `SCRUB_TARGETS` adds `ask_question`.
- `ScheduleStore`:
  - `markRunFinished` takes an optional `ask` and writes `ask_reason` and
    the scrubbed question (capped at `ASK_QUESTION_MAX`), `ask_posted_at`
    NULL, in the same IMMEDIATE transaction; the cached run gets `ask`.
  - `pendingAsks()`: per schedule, the newest finished run (by
    `completed_at`, rowid tie-break) when it has an untaken ask; older
    pending asks are moot. Memory store mirrors it over its cached runs.
  - `claimRunAsk(runId, now)`: `UPDATE … SET ask_posted_at = ? WHERE id = ?
    AND ask_reason IS NOT NULL AND ask_posted_at IS NULL`; `releaseRunAsk`
    clears it.
- `SchedulerService`:
  - the ask post moves into `postRunAsk(schedule, channelId, ask, context,
    spendWarning?)` (same `askPingKey` / `askPingOwner` / `formatAskReply`
    / `takeSpendWarning` / release logic as before, returns whether it went
    out);
  - `runOne` (bridge) claims its own run's ask right after `finish()` (no
    await in between) and posts it; a failed in-process post is not
    released (today's behaviour). An outcome that could not be recorded
    (write failed twice) has no row, so it posts without a claim, as before;
  - `tick()` ends with `deliverPendingAsks()`: only with an outbound, one
    pass at a time, not awaited; for each pending ask whose schedule still
    exists with a channel the allowlist allows → claim → `postRunAsk` with
    the run's stored summary as context → release when the post resolves
    `false` or throws (logged `[scheduler] ask failed: …`).
    `settleAskDelivery()` lets callers (tests) await the pass.
  - `finish()` carries the whole ask to `markRunFinished`; `onRunFinished`
    still reports only `askReason`.
- Daemon: no code change beyond the comment; it has no outbound, so it never
  claims or posts. Bridge: no change (its scheduler already has owner,
  outbound and the spend outbox).
- Rejected: the daemon posting through a Discord REST token (changes
  REQ-cli-108); retrying a failed in-process bridge post (double posts next
  to the next run's own post and breaks the pinned SAFE-8 test); posting
  every pending ask of a schedule (stale questions); an age cap or a new
  config key (not captured).
