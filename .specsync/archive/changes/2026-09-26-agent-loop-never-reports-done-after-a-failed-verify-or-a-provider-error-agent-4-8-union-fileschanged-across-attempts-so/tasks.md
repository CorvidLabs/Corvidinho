---
change: agent-loop-never-reports-done-after-a-failed-verify-or-a-provider-error-agent-4-8-union-fileschanged-across-attempts-so
artifact: tasks
---

# Tasks

- [x] Regression tests that fail on main (9 failing) and pass after the fix.
- [x] `ExecuteResult.error` set on provider / HTTP / network / malformed-reply failures.
- [x] `runTask` unions filesChanged across attempts and ends `failed` on `exec.error`.
- [x] Delta REQ-agent-242 and Error Cases rows in the agent spec.
