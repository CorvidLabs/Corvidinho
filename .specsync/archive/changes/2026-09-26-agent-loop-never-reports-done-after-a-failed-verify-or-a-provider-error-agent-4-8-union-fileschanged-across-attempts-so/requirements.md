---
change: agent-loop-never-reports-done-after-a-failed-verify-or-a-provider-error-agent-4-8-union-fileschanged-across-attempts-so
artifact: requirements
---

# Requirements

AGENT-4 / AGENT-4.a / AGENT-8 (`hi/agent.md`). Added `REQ-agent-242` (delta
`deltas/agent.md`): files changed are the union across attempts, a retry after
a failed verify is verified again, and an `execute` provider / HTTP failure
ends the run `failed`. No new env vars, flags or slash commands.
