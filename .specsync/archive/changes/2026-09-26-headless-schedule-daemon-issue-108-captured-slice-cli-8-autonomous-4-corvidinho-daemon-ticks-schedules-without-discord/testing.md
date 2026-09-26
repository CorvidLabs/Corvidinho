---
change: headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord
artifact: testing
---

# Testing

- `tests/daemon.test.ts` covers:
  - the lock: second holder refused and named, dead pid taken over, recycled
    pid taken over, young unreadable file not stolen but an old one is,
    release never removes another holder's lock;
  - the logger: JSON line with reserved keys first, secrets scrubbed;
  - `startDaemon`: headless tick, `run.finished` log and completed run row;
    a second daemon refused; stop drains or abandons stragglers as failed and
    frees the lock; `forceStop` cuts the grace; a non-allowlisted channel is
    refused without calling the agent.
- `tests/scheduler.claim.test.ts` uses two DB handles on one temp file:
  - a due run fires once across two tickers;
  - a tick sees create/pause/resume/delete made by the other process;
  - a finishing run never undoes a pause made meanwhile;
  - failures are counted in SQL;
  - in-memory `claimRun` refuses a paused schedule;
  - `abandonInFlight` records a run once.
- `tests/daemon.cli.test.ts` runs the real `bun src/cli.ts daemon` with a
  temp data dir. It checks the `daemon.started` line and the lock file, that
  a second instance exits 1 with `daemon.lock_held`, and that SIGTERM gives
  exit 0 with the lock removed. It also checks that help lists `daemon`.
- The existing scheduler, schedule, scrub and session-worktree tests still
  pass.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-cli-108 | `tests/daemon.test.ts`, `tests/daemon.cli.test.ts` |
| REQ-discord-108 | `tests/scheduler.claim.test.ts`, `tests/scheduler.service.test.ts` |
