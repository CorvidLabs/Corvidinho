---
change: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
artifact: context
---

# Context

Two read-only end-to-end checks of `main` found that schedule runs can stay
`running` forever and leak worktrees (bridge report defect 4; long-running
report D1, D2, D3). All four still reproduced on `main` 6e5370d and again on
`main` bf9a5b2 (v0.0.26, after #160 spend cap), which already have #185
(abort controllers for abandoned runs) and #193 (tick catch,
REQ-discord-331); none was already fixed.

- (a) Bridge stop. `startBridge().stop()` only called `scheduler.stop()`. The
  daemon calls `abandonInFlight`, the bridge never did, so a run in flight at
  SIGTERM stayed `running` in `schedule_runs`, even after a restart
  (REQ-discord-108 says every outcome is recorded once).
- (b) Outcome write. `SchedulerService.finish()` added the run to
  `finishedRuns` before `store.markRunFinished()`. When the write threw
  (`SQLITE_BUSY` past the 5 s busy timeout, e.g. an agent holding the DB
  lock), `runOne`'s catch called `finish()` again, which returned false: the
  error was swallowed, nothing was logged, no `run.finished`, no
  `consecutive_failures` update, and the row stayed `running`.
- (c) Crash. After `kill -9` of the bridge or daemon, nothing at start fixed
  rows left `running`. `/work` has start-up recovery
  (`WorkStore.recoverAbandoned`, SESSION-WORKTREE-3); schedules had none.
- (d) Worktrees. `stop()` never awaited the abandoned run's `settled`
  promise, so `runOne`'s `finally` (which parks the worktree) never ran before
  `process.exit`. Every run abandoned at shutdown left
  `talk-schedule_<schedule>_<run>` and `talk/schedule_<schedule>_<run>`
  behind (unique names, so they pile up), and nothing cleaned them at start.

Constraint that shaped the fix: a bridge and `corvidinho daemon` may share
one data dir (CLI-8 / AUTONOMOUS-4, REQ-discord-108). A blind "fail every
running row at start" (the `/work` pattern) would fail the other live
process's run and `git worktree remove --force` its live cwd. So each run now
records its runner (`<pid>:<proc start>`, schema v10) and recovery only
touches runs whose runner is gone.

Captured HI served: CLI-8, AUTONOMOUS-4 (schedules keep ticking unattended),
DISCORD-SCHEDULE-2 (listed history is honest) and DISCORD-SCHEDULE-4 (no
change to the non-blocking tick), SESSION-WORKTREE-3 (an abandoned run's
worktree is parked, never silently left). No new env var, slash command or
CLI flag.
