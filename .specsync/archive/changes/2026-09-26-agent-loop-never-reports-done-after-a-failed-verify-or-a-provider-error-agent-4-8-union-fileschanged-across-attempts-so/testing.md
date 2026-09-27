---
change: agent-loop-never-reports-done-after-a-failed-verify-or-a-provider-error-agent-4-8-union-fileschanged-across-attempts-so
artifact: testing
---

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
