---
change: agent-loop-provider-error-summary-still-says-plainly-that-an-earlier-verify-failed-agent-4-a-run-that-ends-failed-on-a
artifact: testing
---

# Testing

With the pre-change `src/agent/loop.ts` swapped in, the new and strengthened
assertions fail (`30 pass / 2 fail` across `tests/agent.loop.test.ts` and
`tests/agent.tool-loop.test.ts`); with the change they pass
(`32 pass / 0 fail`).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-242` | `tests/agent.loop.test.ts` | Verify fails on attempt 1, attempt 2 returns an `execute` error: state failed, summary starts with the provider error and then `Verification failed on an earlier attempt and was not re-run:` plus the verify output; states planning, executing, verifying, executing, failed. |
| `REQ-agent-242` | `tests/agent.loop.test.ts` | A first-attempt `execute` error ends failed and its summary does not mention verification. |
| `REQ-agent-242` | `tests/agent.tool-loop.test.ts` | Code-tier repro through `createTaskExecute` (write, failed verify, HTTP 503 on retry) ends failed with the 503 error and the verify output in the summary. |
