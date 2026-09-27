# Lesson bundle — scheduler-tick-errors-never-crash-the-discord-bridge-a-tick-that-throws-sqlite-busy-in-refresh-listdue-claimrun-is

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Scheduler tick errors never crash the Discord bridge: a tick that throws (SQLITE_BUSY in refresh/listDue/claimRun) is caught and logged scrubbed and the next tick still runs; fire-and-forget runs never reject and always free their running slot
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/scheduler/service.ts, tests/scheduler.tick-errors.test.ts
- **Acceptance**: A scheduler tick that throws (e.g. SQLITE_BUSY from refresh/listDue/claimRun while the daemon, watch or agents share the data dir) is caught by the start() interval and logged to stderr as '[scheduler] tick failed: <message>' with the message scrubbed by scrubSecrets (SAFE-6); it never becomes an unhandled rejection, so the Discord bridge process stays up; tick() still rejects for direct callers (the daemon keeps its own tick.failed log) and releases its tick lock, so the next tick runs and runs claimed before the throw keep going; the fire-and-forget run promise never rejects (a run whose failure cannot be recorded logs '[scheduler] run failed: ...') and always frees its running slot even when parking the worktree throws, so the schedule is not wedged; no global unhandledRejection handler is installed; regression tests in tests/scheduler.tick-errors.test.ts fail on the old code and pass

## Evidence

- Verification commit: `c10737776f315f341cf87061debf4345f7170ef3`
- Base commit: `aef2cde685e9e9be6f0dc1c4311a916e33981afc`
- Verified by: `specsync check --spec discord`

## From the change's context.md

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

## From the change's testing.md

# Testing

These are fixture tests only: an in-memory `ScheduleStore` whose methods
throw on purpose, stub agents, temp dirs, and one child Bun process. There
is no Discord, no network and no token. The `ghp_…` value in the thrown
messages is a fake token, used to check that logs are scrubbed.

`tests/scheduler.tick-errors.test.ts`:

- **Interval, `listDue` throws once.** There is no unhandled rejection. One
  `[scheduler] tick failed: SQLITE_BUSY …` line is logged, with
  `[redacted:github-token]` and no raw token. The next tick starts the due
  run, and `execution_count` is 1.
- **Interval, `claimRun` throws once.** There is no unhandled rejection, and
  the next tick claims and runs the schedule.
- **Odd errors.** One tick throws an error whose message has a newline, and
  the next throws a null-prototype object (`String()` of it throws). Each is
  logged as one `[scheduler] tick failed:` line (the second as
  `(unprintable error)`), the logger never throws, there is no unhandled
  rejection, and the third tick runs the due schedule.
- **Bridge-style child process.** A child `bun` process runs the scheduler
  interval with a store that throws once, and keeps itself alive with its
  own ref'd timer, as the bridge does. It stays up and exits 0, and its
  stderr has the scrubbed `tick failed` line. The test installs no process
  handler in the child.
- **Manual `tick()`, lock release.** `claimRun` throws on the second due
  schedule, and `tick()` rejects while the first run keeps going. The next
  `tick()` starts the second. Both finish with `execution_count` 1.
- **Double fault in a run.** The agent throws and `markRunFinished` also
  throws. The run logs `[scheduler] run failed: SQLITE_BUSY …` with no raw
  token, frees its slot, and there is no unhandled rejection.
- **Park failure.** `parkWorktree` (spied) throws. The run logs
  `[scheduler] run failed: park failed` and frees its slot, and the same
  schedule starts again on a later tick.

## Before and after

- **Before the fix** (`service.ts` from `main`, same test file): 6 fail and
  1 pass. The lock-release guard test passes, because the old `finally`
  already freed the tick lock. The child process exits with code 1 and
  prints nothing to stdout, and every in-process case reports the unhandled
  `SQLITE_BUSY` / `park failed` rejection.
- **After the fix:** 7 pass and 0 fail. The existing
  `tests/scheduler.service.test.ts`, `tests/scheduler.worktree.test.ts`,
  `tests/daemon.test.ts` and `tests/daemon.cli.test.ts` still pass.

Also run: `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100` and
`fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-331` | `tests/scheduler.tick-errors.test.ts` | Interval `listDue`/`claimRun` throwing once gives no unhandled rejection, a scrubbed `[scheduler] tick failed:` line, and the next tick runs the due schedule. A multi-line or unprintable error is logged on one line and never rejects. A bridge-style child process stays up (exit 0, exit 1 before the fix). A manual `tick()` rejects but frees the tick lock and keeps claimed runs going. A run double fault and a `parkWorktree` failure log `[scheduler] run failed:`, free the slot and never reject. |
| `REQ-discord-108` | `tests/scheduler.service.test.ts`, `tests/daemon.test.ts` | The atomic claim, one outcome per run and the daemon tick loop pass unchanged. `tick()` still rejects to direct callers, so the daemon's `tick.failed` path is kept. |

## Where these lessons go

- `specs/discord/context.md`
