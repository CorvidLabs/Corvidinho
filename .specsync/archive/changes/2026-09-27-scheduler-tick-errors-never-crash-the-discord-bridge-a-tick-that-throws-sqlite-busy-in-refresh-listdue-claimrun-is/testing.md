---
change: scheduler-tick-errors-never-crash-the-discord-bridge-a-tick-that-throws-sqlite-busy-in-refresh-listdue-claimrun-is
artifact: testing
---

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
