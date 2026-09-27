---
change: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
artifact: tasks
---

# Tasks

- [x] Re-verify on `main` 6e5370d and, after rebasing, bf9a5b2: (a) bridge stop leaves the run `running`, (b) one throwing outcome write leaves it `running` with no log or event, (c) a `kill -9` leaves it `running` after a restart, (d) a daemon stop leaves the run's worktree and branch. None already fixed.
- [x] Regression tests in `tests/scheduler.never-stuck.test.ts` and `tests/daemon.restart-recovery.test.ts` (fake `sh` agent bins, child Bun runners, temp git repos); 9 fail before, 9 pass after.
- [x] `ScheduleStore`: `schedule_runs.runner` (schema v10), IMMEDIATE-transaction `markRunFinished`, `recoverAbandonedRuns`, `runRecord`, `durable`.
- [x] `SchedulerService.finish()` records only after the write succeeds: log + retry once, then log `[scheduler] run failed: could not record run …` and count the run failed; the catch logs errors of already-recorded runs.
- [x] `abandonInFlight` always aborts and tracks settling runs; `settleAbandoned(ABANDONED_SETTLE_MS)`.
- [x] `recoverAbandoned()` at bridge and daemon start: fail dead-runner runs, park leftover schedule-run worktrees with `branchHasOwnCommits`-safe cleanup, leave live runners alone.
- [x] Review fix: recovery parks only worktrees of runs this data dir recorded as ended (under the named schedule); another data dir's schedule worktree is never touched (regression test in `tests/daemon.restart-recovery.test.ts`).
- [x] Bridge `stop()` abandons in-flight runs (`interrupted: bridge shutdown`) and waits the bounded settle; daemon `stop()` waits it before closing the DB.
- [x] Pinned schema version tests updated (v10); docs and spec text / `files:` / testing notes updated.
- [x] Deltas: Added REQ-discord-346, Modified REQ-cli-108.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
