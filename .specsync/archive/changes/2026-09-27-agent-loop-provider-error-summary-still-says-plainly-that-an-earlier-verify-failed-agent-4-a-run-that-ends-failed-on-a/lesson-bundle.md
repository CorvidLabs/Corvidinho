# Lesson bundle — agent-loop-provider-error-summary-still-says-plainly-that-an-earlier-verify-failed-agent-4-a-run-that-ends-failed-on-a

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Agent loop provider-error summary still says plainly that an earlier verify failed (AGENT-4): a run that ends failed on a provider error after a failed verify keeps that verify output in its summary
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: src/agent/loop.ts, tests/agent.loop.test.ts, tests/agent.tool-loop.test.ts
- **Acceptance**: When a verify has failed and a later attempt ends the run failed on a provider error, TaskResult.summary starts with the provider error and then says 'Verification failed on an earlier attempt and was not re-run:' followed by that verify output; a provider error before any verify ran adds no such note; state stays failed, verified=false

## Evidence

- Verification commit: `35a3a49c82b8842f22cd99b5f08d95d3c2e05985`
- Base commit: `a5b699c326901e3556d6c233674e6be6698454a4`
- Verified by: `specsync check --spec agent`

## From the change's context.md

# Context

Adversarial review of PR #199 (bug agent-loop-2). The PR makes a provider /
HTTP failure end the run `failed` (REQ-agent-242), which is correct, but in
its headline scenario the result no longer says that verification failed:
attempt 1 writes `app.ts`, verify fails, attempt 2 gets HTTP 503, and the
run ends `failed` with only `LLM HTTP 503: upstream overloaded` as the
summary. The failing file stays on disk and nothing in the summary tells the
human (or a delegating lead reading the worker summary) that it failed
verification. The stuck path already appends the verify output to the
summary; the provider-error path dropped it.

AGENT-4 (`hi/agent.md`): it does not say done until verify passed, or it
tells me plainly that verification failed. State and exit code were already
right; this change is about the summary text only.

## From the change's testing.md

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

## Where these lessons go

- `specs/agent/context.md`
