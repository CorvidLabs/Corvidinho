---
change: scheduler-tick-errors-never-crash-the-discord-bridge-a-tick-that-throws-sqlite-busy-in-refresh-listdue-claimrun-is
artifact: context
---

# Context

A crash and restart-recovery audit of `main` found this bug. It is a bug fix
only, with no new HI.

- In `src/scheduler/service.ts`, `start()` runs
  `setInterval(() => void this.tick())`. `tick()` is a `try`/`finally` with
  no `catch`.
- So when `refresh()`, `listDue()` or `claimRun()` throws, the promise
  rejects and nothing handles it. One example is `SQLITE_BUSY` after the 5 s
  `busy_timeout` in `src/store/db.ts`, while the bridge, `corvidinho daemon`,
  watch and agents share one data dir.
- Bun 1.4.2 exits with code 1 on an unhandled rejection. That kills the whole
  Discord bridge, orphans in-flight agent children, and leaves the bot down.
  Nothing restarts it in pidfile/nohup mode.
- The daemon already wraps its own tick loop in a `catch` (`tick.failed`), but
  the bridge path does not.
- The same crash can happen through the fire-and-forget run promise
  (`entry.settled = this.runOne(...)`), which nothing handles:
  - If the agent throws and `markRunFinished` then throws too, `runOne`
    rejects.
  - If `parkWorktree` throws in `runOne`'s `finally`, `runOne` rejects and
    also skips `running.delete`. That wedges the schedule for good and holds
    one of the two concurrency slots.

We reproduced it on `main` with a small script. After one throwing
`listDue`, a bridge-like process with its own ref'd timer printed the error
and exited 1.

Captured HI served:

- DISCORD-SCHEDULE-4: schedule ticks must not starve or delay the live
  ingress path. A dead bridge has no ingress at all.
- CLI-8 and AUTONOMOUS-4: schedules keep ticking without anyone watching
  them.

Constraints:

- No global `unhandledRejection` swallow, and no new product surface (env
  var, flag, slash command or schema).
- Logs are scrubbed (SAFE-6).
- `tick()` keeps rejecting for direct callers, so the daemon's structured
  `tick.failed` log is unchanged.
