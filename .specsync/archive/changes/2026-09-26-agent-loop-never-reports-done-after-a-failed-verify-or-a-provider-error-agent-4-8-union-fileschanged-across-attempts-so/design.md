---
change: agent-loop-never-reports-done-after-a-failed-verify-or-a-provider-error-agent-4-8-union-fileschanged-across-attempts-so
artifact: design
---

# Design

- `ExecuteResult` gains optional `error?: boolean`. `createTaskExecute` sets
  it when the chat completion call fails (fetch throws, non-2xx status, reply
  not JSON, no assistant message), on both the tool loop and the read-tier
  single chat. Success replies leave it unset, so other executors are
  unaffected.
- `runTask` keeps `filesChanged` as the union of every attempt's list. A
  verify only runs when that list is non-empty and the union never shrinks, so
  once a verify has failed every later attempt is verified again: the run ends
  `done` only on a passing verify, else `failed` (with the existing stuck ask)
  when retries run out.
- After the ask check, `exec.error` ends the run: `StateChanged failed`,
  `state=failed`, `verified=false`, `verifySkipped=false`, summary = the
  provider error. `task run` already exits 1 on `failed`, so bridges see
  `ok=false`. `TaskResult` and the NDJSON wire are unchanged (protocol 2).
