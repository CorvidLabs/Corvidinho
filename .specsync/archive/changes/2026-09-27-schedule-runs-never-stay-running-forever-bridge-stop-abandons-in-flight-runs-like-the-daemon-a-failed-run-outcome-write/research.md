---
change: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
artifact: research
---

# Research

- `src/scheduler/service.ts` (main 6e5370d, unchanged in this respect on bf9a5b2): `finish()` did
  `finishedRuns.add(run)` then `store.markRunFinished()`; `runOne`'s catch
  calls `finish()` again and ignored its `false`. `abandonInFlight` clears
  `running` and aborts the signal, but nobody awaited `entry.settled`.
- `src/discord/bridge.ts` `stop()`: `scheduler?.stop(); await gateway.stop();`
  only. `src/daemon/daemon.ts` `stop()`: drain → `abandonInFlight` → close DB
  → release lock, then the CLI calls `process.exit(0)`.
- `src/scheduler/store.ts` `markRunFinished`: three separate autocommit
  statements (schedules counter, SELECT, run row), so a retry after a partial
  failure could count a failure twice; in-memory fields were set before the
  write.
- `src/discord/work-store.ts` `recoverAbandoned` marks every queued/running
  row failed at bridge start: fine for a bridge-only table, unsafe for
  `schedule_runs`, which a daemon on the same data dir also writes.
- `src/daemon/lock.ts` already has `readProcStart` / `isHolderAlive`
  (`<pid>` + `/proc` start time, EPERM = alive), reused for the runner id.
- `src/worktree/manager.ts` `parkWorktree` → `removeWorktree(cleanBranch)` →
  `cleanupEmptyBranch` deletes a branch only when `branchHasOwnCommits` is
  false (any git error keeps it) — the safe cleanup to reuse.
- Repro: the new tests fail on main (9 fail): bridge stop leaves the row
  `running`; one throwing write leaves it `running` with no event; a
  `kill -9` of a child runner leaves it `running` after a bridge or daemon
  start; worktree and branch still listed after a daemon stop or start.
