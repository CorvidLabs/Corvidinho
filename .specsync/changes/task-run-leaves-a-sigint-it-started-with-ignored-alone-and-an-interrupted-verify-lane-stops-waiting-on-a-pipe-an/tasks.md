---
change: task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an
artifact: tasks
---

# Tasks

- [x] Regression tests fail on the PR head before this change: a run started with SIGINT ignored exited 130 on SIGINT (`exitCode` 130, expected still running); a lane with an escaped `setsid` process holding stdout was "still running" 10 s after SIGTERM.
- [x] `taskRun` hooks only `forwardedSignals()` (SIGINT / SIGTERM not started ignored) and removes exactly those.
- [x] The default verify runner stops waiting on the lane's pipes 250 ms after an abort.
- [x] Regression tests pass after the change; the PR's SIGINT / SIGTERM, loop and execute tests still pass.
- [x] Deltas: Modified REQ-cli-244 and REQ-agent-244; spec Error Cases, invariant and change logs updated.
