---
id: scheduler-tick-errors-never-crash-the-discord-bridge-a-tick-that-throws-sqlite-busy-in-refresh-listdue-claimrun-is
state: draft
type: bug_fix
base_commit: aef2cde685e9e9be6f0dc1c4311a916e33981afc
---

# Scheduler tick errors never crash the Discord bridge: a tick that throws (SQLITE_BUSY in refresh/listDue/claimRun) is caught and logged scrubbed and the next tick still runs; fire-and-forget runs never reject and always free their running slot

## Intent

Scheduler tick errors never crash the Discord bridge: a tick that throws (SQLITE_BUSY in refresh/listDue/claimRun) is caught and logged scrubbed and the next tick still runs; fire-and-forget runs never reject and always free their running slot

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A scheduler tick that throws (e.g. SQLITE_BUSY from refresh/listDue/claimRun while the daemon, watch or agents share the data dir) is caught by the start() interval and logged to stderr as '[scheduler] tick failed: <message>' with the message scrubbed by scrubSecrets (SAFE-6); it never becomes an unhandled rejection, so the Discord bridge process stays up; tick() still rejects for direct callers (the daemon keeps its own tick.failed log) and releases its tick lock, so the next tick runs and runs claimed before the throw keep going; the fire-and-forget run promise never rejects (a run whose failure cannot be recorded logs '[scheduler] run failed: ...') and always frees its running slot even when parking the worktree throws, so the schedule is not wedged; no global unhandledRejection handler is installed; regression tests in tests/scheduler.tick-errors.test.ts fail on the old code and pass

## No-spec Rationale

Not applicable
