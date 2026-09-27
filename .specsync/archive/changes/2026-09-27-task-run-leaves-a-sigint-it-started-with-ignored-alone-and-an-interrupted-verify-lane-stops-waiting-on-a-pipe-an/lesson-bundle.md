# Lesson bundle — task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Task run leaves a SIGINT it started with ignored alone, and an interrupted verify lane stops waiting on a pipe an escaped lane process holds (agent-loop-4 follow-up)
- **Kind**: BugFix
- **Specs**: cli, agent
- **Paths**: src/cli.ts, src/agent/verify.ts, tests/agent.cli.test.ts
- **Acceptance**: A task run started with SIGINT ignored (a background job of a non-interactive shell) keeps SIGINT ignored: a SIGINT leaves the run and its verify lane running, while SIGTERM still cancels it (exit 130, final ndjson result frame with cancelled=true); SIGINT/SIGTERM that were not ignored at start still abort the run as before; after an abort the default verify runner waits at most a short grace (250 ms) for the lane's output pipes, so a lane process that escaped the tree kill and still holds a pipe no longer keeps the interrupted run from exiting; no new env vars, flags or slash commands; fixture CLI tests prove both regressions

## Evidence

- Verification commit: `43141c560ff51045a34ecbf587dada7db7d41d98`
- Base commit: `4dccb453fe3170cb77327622916a232d2294d6dc`
- Verified by: `specsync check --spec agent --spec cli`

## From the change's context.md

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

## From the change's design.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-244` | `tests/agent.cli.test.ts` | "SIGINT the run started with ignored (a background job) stays ignored; SIGTERM still cancels". `task run --task demo --output ndjson` runs under `sh -c 'trap "" INT; exec "$@"'` with a fake `fledge` that blocks. 1 s after a SIGINT the run has no exit code or signal and the fake fledge is alive; a SIGTERM then exits 130, the last frame is a `result` with `cancelled: true`, and the fake fledge is gone. On the PR head before this change the SIGINT cancelled the run (`exitCode` 130). |
| `REQ-cli-244` | `tests/agent.cli.test.ts` | Existing "SIGINT during verify: …" and "SIGTERM during verify: …" still pass (signals not started ignored are still hooked). |
| `REQ-agent-244` | `tests/agent.cli.test.ts` | "a lane process that escaped the tree kill and holds the output pipe does not keep the run from exiting". The fake `fledge` starts `(setsid sh -c '…; exec sleep 30' &)` (own session, reparented, holding the lane's stdout) and blocks. SIGTERM exits 130 in under 8 s with a cancelled `result` frame and the fake fledge gone. On the PR head before this change the run was "still running" 10 s after SIGTERM. |
| `REQ-agent-244` | `tests/agent.loop.test.ts`, `tests/agent.execute.test.ts` | The PR's abort-during-verify and LLM timeout tests still pass. |

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`
and `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/cli/context.md`
- `specs/agent/context.md`
