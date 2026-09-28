# Lesson bundle — agent-loop-never-reports-done-after-a-failed-verify-or-a-provider-error-agent-4-8-union-fileschanged-across-attempts-so

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Agent loop never reports done after a failed verify or a provider error (AGENT-4/8): union filesChanged across attempts so a retry that changes nothing is re-verified, and provider/HTTP failures return an execute error flag that ends the run failed
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: src/agent/loop.ts, src/agent/execute.ts, src/agent/types.ts, tests/agent.loop.test.ts, tests/agent.tool-loop.test.ts
- **Acceptance**: A retry after a failed verify that changes no files is verified again and the run ends failed (non-zero exit) when retries run out, never done; filesChanged is the union across attempts; a provider or HTTP failure (bad key, 5xx, network error, malformed reply) sets ExecuteResult.error and runTask ends failed instead of done, with or without the verify gate

## Evidence

- Verification commit: `d0b908b709f9b2ae7f07e80ba0d7fa50d7d14492`
- Base commit: `e8bbd215036e7dc8739ac9159afa19f17ae943c6`
- Verified by: `specsync check --spec agent`

## From the change's context.md

# Context

Bug agent-loop-2 (high). `runTask` reset `filesChanged` to the current
attempt's list, and `wantVerify` needs a non-empty list. So after a failed
verify, a retry that changed nothing (the provider returned HTTP 503, the model
only answered in text, or its write was refused) skipped verify and returned
`state=done`, `verifySkipped=true`: the CLI exited 0 with the broken file
still on disk. Provider failures (bad key, outage, network error) came back
from `execute` as an ordinary summary with no files, so a first-attempt
provider failure was also `done`, exit 0; Discord `/work` marked it
completed and bridges reported `ok=true`.

This breaks AGENT-4 (never done until verify passed, or say plainly that it
failed) and AGENT-8 (the reported state must be true). The existing loop tests
only covered retries that returned files.

## From the change's design.md

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

## From the change's testing.md

# Testing

Before the fix the 9 new tests fail (`22 pass / 9 fail` across
`tests/agent.loop.test.ts` and `tests/agent.tool-loop.test.ts`); after it they
pass (`31 pass / 0 fail`).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-242` | `tests/agent.loop.test.ts` | Failed verify then text-only retries: verify runs every attempt, state failed, verifySkipped=false, filesChanged kept, never done. |
| `REQ-agent-242` | `tests/agent.loop.test.ts` | filesChanged from attempts 1 and 2 are reported as a union. |
| `REQ-agent-242` | `tests/agent.loop.test.ts` | `execute` error on the first attempt, on a retry after a failed verify, and with the verify gate off all end failed; verify never runs on the error attempt. |
| `REQ-agent-242` | `tests/agent.tool-loop.test.ts` | Tool-loop HTTP 503 and network failure, and read-tier HTTP 401, set `error: true`; a normal reply leaves it unset. |
| `REQ-agent-242` | `tests/agent.tool-loop.test.ts` | Bug repro through `createTaskExecute` (code tier): write, failed verify, then HTTP 503 on the retry ends failed with 3 LLM calls, 1 verify, 2 attempts. |

## Where these lessons go

- `specs/agent/context.md`
