---
change: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
artifact: design
---

# Design

- `ScheduleStore`:
  - `markRunFinished` runs its writes in one `db.transaction(...).immediate()`
    (write lock up front so busy_timeout applies; a failed attempt changes
    nothing) and updates the cached run/schedule only after it commits.
  - `claimRun` writes `runner` = `scheduleRunnerId()` (`<pid>:<proc start>`;
    constructor option `runner` for tests). Schema v10 adds
    `schedule_runs.runner TEXT` (additive `ALTER TABLE`, same pattern as v7/v8).
  - `recoverAbandonedRuns(now, isAlive)`: `running` rows whose runner is null
    or not alive (`isScheduleRunnerAlive` → `isHolderAlive`) are set `failed`,
    error `RUN_INTERRUPTED_BY_RESTART`, `completed_at` (guarded by
    `AND status = 'running'`). Counters untouched. No-op for the memory store.
  - `runStatus(runId)` and a `durable` getter for the worktree scan.
- `SchedulerService`:
  - `finish()`: write first; on throw log "retrying once" and retry; on a
    second throw log `[scheduler] run failed: could not record run …`, mark
    the cached run failed, bump the in-memory failure count, report
    `ok: false` ("run outcome not recorded: …"). Only then add to
    `finishedRuns`. `runOne`'s catch logs the error when `finish()` returns
    false instead of dropping it.
  - `abandonInFlight` wraps `finish()` in try/catch so the abort always
    happens, and keeps each aborted run's `settled` promise in a set;
    `settleAbandoned(ms)` waits for them (bounded), `ABANDONED_SETTLE_MS`
    = 3 000.
  - `recoverAbandoned()`: store recovery, then (durable store and worktrees
    on) for the default project root and each schedule's resolved project
    that is a git repo, `git worktree list --porcelain`; entries named
    exactly `talk-schedule_<s>_<srun_…>` on branch `talk/schedule_<s>_<srun_…>`
    whose run is not `running` go through `parkWorktree(kind: "worktree")`.
    Errors are logged (`[scheduler] recovery failed: …`), never thrown; a
    failed row recovery skips the worktree scan.
- Bridge: `recoverAbandoned()` right after the scheduler is built (before the
  gateway and the first tick), one `[discord] restart recovery:` line;
  `stop()` → `scheduler.stop()` → `abandonInFlight("interrupted: bridge
  shutdown")` → `settleAbandoned(3 s)` → `gateway.stop()`. No drain grace:
  the bridge stop stays fast (the updater escalates to SIGKILL after 5 s).
- Daemon: `recoverAbandoned()` before arming the interval, `daemon.recovered`
  (warn) after `daemon.started`; `stop()` awaits `settleAbandoned(3 s)` after
  `daemon.abandoned`, before closing the DB. A second signal does not skip it.
- Rejected: failing every `running` row at start (kills a live daemon's run
  and worktree when a bridge restarts on the same data dir); racing the
  settle with the second signal (double SIGTERM would leak worktrees again).
