---
change: headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord
artifact: plan
---

# Plan

1. Make the schedule store safe for two processes: add `refresh`, a
   compare-and-set `claimRun`, and column-scoped writes.
2. In `SchedulerService`, refresh and claim in `tick`, record each run once
   through `finish`, and add `onRunFinished`, `drain` and `abandonInFlight`.
3. Add `src/daemon/` (lock, JSON logger, start/stop/run) and a small
   `daemon` hook in `src/cli.ts` plus a help line.
4. Write fixture tests: the lock, the logger, the headless tick, the second
   instance, graceful and forced stop, the channel gate, cross-process claim,
   pause and counters, and a CLI SIGTERM run.
5. Write `docs/DAEMON.md` and a README pointer.
6. Add the spec deltas (REQ-cli-108, REQ-discord-108) and list the new files
   in `specs/cli`. Then run SpecSync, tsc, bun test and fledge verify.
