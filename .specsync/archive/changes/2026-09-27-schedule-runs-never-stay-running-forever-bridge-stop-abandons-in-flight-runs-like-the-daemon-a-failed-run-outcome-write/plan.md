---
change: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
artifact: plan
---

# Plan

1. Regression tests `tests/scheduler.never-stuck.test.ts` (discord) and
   `tests/daemon.restart-recovery.test.ts` (cli); confirm they fail on main.
2. Store: runner column (schema v10), atomic `markRunFinished`,
   `recoverAbandonedRuns`, `runStatus`, `durable`.
3. Service: `finish()` retry/loud path, catch logging, `abandonInFlight`
   settle tracking, `settleAbandoned`, `recoverAbandoned`.
4. Wire bridge `startBridge` (recovery, stop) and daemon (recovery, settle).
5. Bump pinned schema-version assertions; docs (`docs/DAEMON.md`,
   `docs/discord.md`); spec text, `files:` and testing notes; deltas.
6. `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
