---
module: agent
change: agent-loop-provider-error-summary-still-says-plainly-that-an-earlier-verify-failed-agent-4-a-run-that-ends-failed-on-a
---

# Delta — agent (provider-error summary keeps an earlier verify failure)

## Modified

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
When a verify already failed earlier in the run, that summary SHALL go on to
say plainly `Verification failed on an earlier attempt and was not re-run:`
followed by the last verify output, so the provider error never hides failing
files (AGENT-4); a provider error before any verify ran adds no such note.

Acceptance Criteria
- A failed verify followed by retries that change no files runs verify on every attempt and ends `failed` (`task run` exits non-zero), never `done`.
- `TaskResult.filesChanged` is the union across attempts.
- Tool-loop and read-tier provider failures (HTTP 401 / 503, network error) set `error: true`; a normal reply leaves it unset.
- An `execute` error on the first attempt, on a retry, or with the verify gate off ends `failed` without running verify on that attempt.
- An `execute` error after a failed verify keeps the provider error first and then the earlier verify output in the summary; one before any verify does not mention verification.
