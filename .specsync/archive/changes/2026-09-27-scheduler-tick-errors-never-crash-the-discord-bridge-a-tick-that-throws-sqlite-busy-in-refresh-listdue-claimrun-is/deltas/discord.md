---
module: discord
change: scheduler-tick-errors-never-crash-the-discord-bridge-a-tick-that-throws-sqlite-busy-in-refresh-listdue-claimrun-is
---

# Delta — discord (schedule tick errors never crash the bridge)

## Added

### REQUIREMENT REQ-discord-331

A schedule tick that throws SHALL NOT take down the process that runs it
(DISCORD-SCHEDULE-4 / CLI-8 / AUTONOMOUS-4). The store calls a tick makes
(`refresh`, `listDue`, `claimRun`) can throw, for example `SQLITE_BUSY` after
the 5 s busy timeout while the bridge, `corvidinho daemon`, watch and agents
share one data dir. Bun exits the process on an unhandled rejection.

- The scheduler's own interval (`SchedulerService.start()`, which the Discord
  bridge uses) SHALL catch a rejected tick and log one stderr line,
  `[scheduler] tick failed: <message>`. The message SHALL be passed through
  `scrubSecrets` (SAFE-6) and capped. No stack is logged.
- `tick()` SHALL still reject for direct callers, so the daemon keeps its own
  `tick.failed` JSON log line. A tick that throws SHALL release its tick lock,
  so the next tick runs. Runs it claimed before the throw SHALL keep running.
- The fire-and-forget run promise that a tick starts SHALL never reject. An
  error that escapes a run (for example, recording its failure also throws)
  SHALL be logged the same way as `[scheduler] run failed: <message>`.
- A run SHALL always free its running slot when it ends, even when parking its
  worktree throws, so that schedule can run again and the concurrency cap is
  not used up.
- No global `unhandledRejection` handler SHALL be installed.

Existing tick behaviour is unchanged: the 60 s poll, max 2 concurrent runs,
no catch-up, auto-pause after 5 failures, the atomic claim (REQ-discord-108)
and the non-blocking tick. No new env var, slash command, CLI flag, table or
column.

Acceptance Criteria
- With the interval running, `listDue` or `claimRun` throwing once gives no unhandled rejection, one scrubbed `[scheduler] tick failed:` line with no raw token, and the next tick starts the due run.
- A separate Bun process that runs the scheduler interval, with a store that throws once, stays up and exits 0. Before the fix it exited 1.
- A manual `tick()` whose `claimRun` throws on the second due schedule rejects. The first run keeps going, and the next `tick()` starts the second.
- A run whose agent throws and whose `markRunFinished` also throws logs `[scheduler] run failed:` and frees its slot, with no unhandled rejection.
- A run whose `parkWorktree` throws frees its slot, and the same schedule starts again on a later tick.
