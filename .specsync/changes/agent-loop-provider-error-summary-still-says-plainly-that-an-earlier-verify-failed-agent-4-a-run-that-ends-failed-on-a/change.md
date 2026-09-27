---
id: agent-loop-provider-error-summary-still-says-plainly-that-an-earlier-verify-failed-agent-4-a-run-that-ends-failed-on-a
state: approved
type: bug_fix
base_commit: a5b699c326901e3556d6c233674e6be6698454a4
---

# Agent loop provider-error summary still says plainly that an earlier verify failed (AGENT-4): a run that ends failed on a provider error after a failed verify keeps that verify output in its summary

## Intent

Agent loop provider-error summary still says plainly that an earlier verify failed (AGENT-4): a run that ends failed on a provider error after a failed verify keeps that verify output in its summary

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- When a verify has failed and a later attempt ends the run failed on a provider error, TaskResult.summary starts with the provider error and then says 'Verification failed on an earlier attempt and was not re-run:' followed by that verify output; a provider error before any verify ran adds no such note; state stays failed, verified=false

## No-spec Rationale

Not applicable
