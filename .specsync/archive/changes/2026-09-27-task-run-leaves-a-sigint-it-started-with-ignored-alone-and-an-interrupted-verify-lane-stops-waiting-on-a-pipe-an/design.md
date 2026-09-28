---
change: task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an
artifact: design
---

# Design

- **CLI (`src/cli.ts`, REQ-cli-244).** `taskRun` hooks only the signals in
  `forwardedSignals()` from `src/plugins/proc-group.ts` (SIGINT / SIGTERM
  not ignored when this process started; the set is read once at module
  load, before any listener exists). A signal started ignored gets no
  listener, so it stays SIG_IGN during and after the run. The same list is
  used to remove the listeners in `finally`. Nothing else changes: the
  first hooked signal aborts, a second one takes its default action.
- **Verify runner (`src/agent/verify.ts`, REQ-agent-244).** The abort
  listener still kills the lane's tree, and now also arms a 250 ms timer.
  The runner races the pipe reads (`stdout`, `stderr`, read together)
  against that timer; when the timer wins it returns
  `{ success: false, output: "verify lane aborted" }`, which `runTask`
  turns into the cancelled result as before. Without an abort the reads are
  awaited as before, so a normal run's output capture is unchanged. The
  timer is cleared in `finally`. The grace is a private constant (same value
  as `spawnCapped`'s pipe grace), not a new export.
- Unchanged: `TaskResult`, NDJSON protocol 2, verify argv, the tree kill
  itself (REQ-plugins-154), the LLM timeout.
