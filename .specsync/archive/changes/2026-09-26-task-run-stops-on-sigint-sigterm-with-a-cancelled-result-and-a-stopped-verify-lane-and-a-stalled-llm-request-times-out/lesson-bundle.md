# Lesson bundle — task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Task run stops on SIGINT/SIGTERM with a cancelled result and a stopped verify lane, and a stalled LLM request times out (agent-loop-4)
- **Kind**: BugFix
- **Specs**: cli, agent
- **Paths**: src/cli.ts, src/agent/execute.ts, src/agent/loop.ts, src/agent/verify.ts, tests/agent.cli.test.ts, tests/agent.execute.test.ts, tests/agent.loop.test.ts
- **Acceptance**: SIGINT or SIGTERM to a running task run aborts the run: the verify lane (fledge and its tasks, own process group) and the tool loop stop, the structured cancelled result is still printed (a final ndjson result frame with cancelled=true under --output ndjson) and the process exits 130 instead of dying by the signal; an abort while the verify lane runs yields cancelled=true even when no retries remain (no VerifyResult failure, no retry, no stuck ask); each OpenAI-compatible chat completions request (waiting for headers and reading the body) is bounded by a per-request timeout (default 10 minutes) so a stalled provider returns an LLM request timed out error instead of hanging task run and the Discord/watch runs that await it; a caller abort still stops the request and is not reported as a timeout; no new env vars, flags or slash commands; fixture tests prove each regression with no network

## Evidence

- Verification commit: `345bfb8a57df5ac3b5112ef9b35713b6e95bfd05`
- Base commit: `2ff0598784b5e7c72f2c0eedbb85131324e7e239`
- Verified by: `specsync check --spec agent --spec cli`

## From the change's context.md

# Context

A bug sweep (agent-loop-4) found that `corvidinho task run` never connected
an AbortSignal. `taskRun` in `src/cli.ts` called `runTask` without `signal`,
so `runTask` used `new AbortController().signal`, which never fires. The
cancelled path, exit 130 and the verify runner's `signal` were dead code in
the CLI. Two failures followed:

- (a) SIGINT or SIGTERM from a supervisor, a user or a parent during verify
  killed corvidinho through Bun's default handler. No cancelled result, no
  exit 130 and no ndjson `result` frame were produced. The spawned
  `fledge lanes run verify` ran to completion in the background (AGENT-3:
  "when I interrupt it, it actually stops instead of finishing in the
  background").
- (b) `chatCompletions` in `src/agent/execute.ts` had no timeout. A provider
  that accepted the request and then stalled (headers, then a byte every few
  seconds) hung `task run` forever, and with it the Discord / watch / daemon
  runs and delegate workers waiting on that child.

Repro before the fix, on this branch's base (2ff0598):

- (a) Fake `fledge` on PATH that starts a lane task and blocks.
  `task run --task demo --output ndjson`, then SIGINT to the pid. The process
  died by the signal (`signalCode "SIGINT"`, SIGTERM gave 143), stdout had no
  `result` frame, and the fake lane kept running.
- (b) Local server that sends headers and then trickles a space every 50ms.
  The read-tier and tool-tier execute never returned; the regression tests
  hit bun's 5s test timeout.

While fixing (a), passing the signal alone was not enough. Bun's `signal`
spawn option SIGTERMs only `fledge`. A probe with the real fledge 1.8.0 (a
lane task `sleep 37`) showed that fledge dies on SIGTERM and leaves its lane
task running as an orphan. The verify runner therefore uses the process-group
helper from #185 (REQ-plugins-154), as Fledge plugin runs, delegate workers
and bridge-spawned agents already do.

Constraints: no new env vars, flags or slash commands. No package, CHANGELOG
or STATUS edits. The NDJSON protocol and the `TaskResult` shape stay the same.

## From the change's design.md

# Design

- **CLI (`src/cli.ts`, REQ-cli-244).** `taskRun` creates an
  `AbortController`, installs `process.once("SIGINT" | "SIGTERM")` listeners
  that abort it, and passes `signal` to `runTask`. The listeners are removed
  in a `finally` once the run returns. The existing output code then prints
  the cancelled result in the chosen mode (text, `--json`, or the ndjson
  `result` frame), and the existing `result.cancelled → 130` mapping sets the
  exit code. With `once`, a second signal gets its default action, so an
  operator can still force-quit. The proc-group signal hook defers to these
  listeners when another listener exists, so the abort path owns shutdown.
- **Verify runner (`src/agent/verify.ts`, REQ-agent-244).** `fledge` is
  spawned with `detached: true`, so it gets its own process group, and is
  registered with `trackChildProcess`. On abort, `killProcessTree` stops
  fledge and every lane task it started (SIGSTOP then SIGKILL, pid-reuse
  guarded). A snapshot taken as fledge exits lets a later abort, or this
  process exiting, still reach a leftover group member. An already-aborted
  signal returns before spawning, because an abort listener added after the
  fact would never fire. This is the same pattern as `spawnCapped`, the
  delegate core and the Discord agent client (REQ-plugins-154).
- **Loop (`src/agent/loop.ts`).** After the verify runner returns, `runTask`
  checks the signal and returns `cancelledResult` before emitting
  `VerifyResult` or counting a retry. A stopped lane exits non-zero, and
  without this check `--max-retries 0` turned an interrupt into `failed`
  with a `stuck` ask (exit 1).
- **LLM timeout (`src/agent/execute.ts`, REQ-agent-244).**
  `chatCompletions` combines the caller's signal with a per-request timeout
  controller through `AbortSignal.any`. The same combined signal covers
  `fetch` (headers) and `resp.json()` (body), because Bun aborts a body read
  when the fetch signal fires. The timer is cleared in `finally`. When the
  timeout fired and the caller's signal did not, the result is
  `LLM request timed out after <ms>ms`. Otherwise the existing error paths
  are unchanged, and the tool loop and `runTask` still turn a caller abort
  into a cancel. The default is `LLM_REQUEST_TIMEOUT_MS` = 10 minutes, the
  same wall clock as a whole delegate worker run. `CreateTaskExecuteOpts`
  gains `llmTimeoutMs` as a code-level seam. No env var is added: the task
  rules say no new env vars unless unavoidable, and a fixed generous cap is
  enough to end the hang.
- Unchanged: `TaskResult` shape, NDJSON protocol (still 2), SAFE-1 gates,
  tool catalog, verify argv (`lanes run verify --non-interactive`), and
  verify output capture on a normal run.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-244` | `tests/agent.cli.test.ts` | "SIGINT during verify: cancelled result frame, exit 130, verify lane stopped" and the SIGTERM twin. These run `task run --task demo --output ndjson` with a fake `fledge` on PATH that starts a lane task (`sleep 30 &`) and waits, then signal the pid once both pids are written. The run exits 130 with `signalCode` null, the last stdout line is a `result` frame with `cancelled: true`, `verified: false`, `state: "failed"`, and both the fake fledge and its lane task are gone. On the base commit SIGINT died by the signal (`signalCode "SIGINT"`) and SIGTERM exited 143, with no result frame. With the signal wired but no tree kill, fledge died and its lane task survived. |
| `REQ-agent-244` | `tests/agent.cli.test.ts` | Same tests: the verify lane's own task is killed with fledge (process group plus `/proc` descendants), not left in the background. |
| `REQ-agent-244` | `tests/agent.loop.test.ts` | "abort while verify runs → cancelled, not a failed verify or stuck ask (AGENT-3)". A verify runner aborts the signal and returns a failed lane with `maxRetries: 0`. The result is `cancelled=true`, `state: "failed"`, no `ask`, one execute call and no `VerifyResult` event. On the base commit it returned `cancelled=false` (failed with a stuck ask). |
| `REQ-agent-244` | `tests/agent.execute.test.ts` | "headers then a trickle: the request times out instead of hanging". A local `Bun.serve` sends headers and then one byte every 50ms. A read-tier execute with `llmTimeoutMs: 300` returns `LLM request timed out after 300ms` within 3s. On the base commit it hung until bun's 5s test timeout. |
| `REQ-agent-244` | `tests/agent.execute.test.ts` | "no response at all: the tool loop's request times out too". A fetch that never answers makes a tool-tier execute with `llmTimeoutMs: 200` return `LLM request timed out after 200ms` after one request. On the base commit it hung until bun's 5s test timeout. |
| `REQ-agent-244` | `tests/agent.execute.test.ts` | "a caller abort still stops the request and is not reported as a timeout". A caller abort after 50ms (timeout 60s) returns within 3s with an `LLM request failed:` summary that does not contain "timed out". |
| `REQ-agent-003` | `tests/agent.loop.test.ts` | Existing "AbortSignal cancels promptly (AGENT-3)" and the verify pass / fail / retry tests still pass. |
| `REQ-agent-008` | `tests/agent.tool-loop.test.ts` | Existing tool-loop tests still pass, including "AbortSignal stops between tool rounds (AGENT-3)". |
| `REQ-cli-073` | `tests/agent.ndjson-spawn.test.ts`, `tests/agent.cli.test.ts` | Existing ndjson / `--json` task run tests still pass; the protocol is unchanged. |

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`
and `fledge lanes run verify --non-interactive` pass.

## Where these lessons go

- `specs/cli/context.md`
- `specs/agent/context.md`
