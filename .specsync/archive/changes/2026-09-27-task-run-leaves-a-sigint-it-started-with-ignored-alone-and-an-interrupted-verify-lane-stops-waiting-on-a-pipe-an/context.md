---
change: task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an
artifact: context
---

# Context

Adversarial review of PR #207 (agent-loop-4: `task run` connects an
AbortSignal, stops the verify lane's tree on SIGINT/SIGTERM and bounds each
LLM request). The PR's fix reproduced and held, but two exit-path gaps were
left:

- `taskRun` hooked SIGINT and SIGTERM with `process.once` unconditionally. A
  process that starts with a signal ignored (a `cmd &` background job of a
  non-interactive shell starts with SIGINT ignored) then had SIG_IGN
  replaced: a Ctrl-C meant for the parent script cancelled the run, and
  `process.off` afterwards restored SIG_DFL, not SIG_IGN (checked with Bun
  1.4.2). The process-tree hook from REQ-plugins-154 (`proc-group.ts`)
  already leaves signals started ignored alone; `task run` did not.
- After an abort, the default verify runner killed the lane's tree and then
  awaited EOF on fledge's stdout and stderr. A lane process that escaped the
  kill (its own session via `setsid`, reparented before the abort, the
  REQ-plugins-154 limit the PR notes) still holds the pipe, so the
  interrupted run waited for it to end. With real fledge 1.8.0 and a lane
  task `(setsid sleep 12 &)`, the runner returned 11.8 s after the abort; a
  daemon-like escapee would keep `task run` from exiting at all.

Constraints: no new env vars, flags or slash commands; no package,
CHANGELOG or STATUS edits; NDJSON protocol and `TaskResult` unchanged.
