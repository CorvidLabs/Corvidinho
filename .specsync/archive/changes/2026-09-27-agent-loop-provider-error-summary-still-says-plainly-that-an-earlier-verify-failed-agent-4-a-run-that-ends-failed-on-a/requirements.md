---
change: agent-loop-provider-error-summary-still-says-plainly-that-an-earlier-verify-failed-agent-4-a-run-that-ends-failed-on-a
artifact: requirements
---

# Requirements

AGENT-4 (`hi/agent.md`). Modifies `REQ-agent-242` (delta
`deltas/agent.md`): when a verify already failed earlier in the run, a
provider-error end keeps the provider error first and then says plainly
`Verification failed on an earlier attempt and was not re-run:` with the last
verify output. A provider error before any verify ran adds no note. No new env
vars, flags, slash commands or wire fields; `TaskResult` shape unchanged.
