---
change: task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out
artifact: design
---

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
