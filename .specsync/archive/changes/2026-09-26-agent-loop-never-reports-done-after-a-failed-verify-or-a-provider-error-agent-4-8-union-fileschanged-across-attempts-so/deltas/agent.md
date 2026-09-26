---
module: agent
change: agent-loop-never-reports-done-after-a-failed-verify-or-a-provider-error-agent-4-8-union-fileschanged-across-attempts-so
---

# Delta — agent (never done after a failed verify or a provider error)

## Added

### REQUIREMENT REQ-agent-242

`runTask` SHALL treat the files changed by a run as the union of every
attempt's `filesChanged`, so once a verify has failed each later attempt is
verified again, even when that attempt changed no files; the run SHALL end
`done` only after a passing verify, else `failed` when retries run out
(AGENT-4 / AGENT-4.a). `createTaskExecute` SHALL set `ExecuteResult.error`
when the provider call fails (request error, non-2xx HTTP status, a reply that
is not JSON or has no assistant message), and `runTask` SHALL end such an
attempt `failed` with `verified=false` and the provider error as the
summary, with or without the verify gate, never `done` (AGENT-4 / AGENT-8).

Acceptance Criteria
- A failed verify followed by retries that change no files runs verify on every attempt and ends `failed` (`task run` exits non-zero), never `done`.
- `TaskResult.filesChanged` is the union across attempts.
- Tool-loop and read-tier provider failures (HTTP 401 / 503, network error) set `error: true`; a normal reply leaves it unset.
- An `execute` error on the first attempt, on a retry, or with the verify gate off ends `failed` without running verify on that attempt.
