---
change: steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing
artifact: requirements
---

# Requirements

### REQ-agent-001
Agent task runner exposes AGENT-8 states: planning, executing, verifying, done, failed (and idle).

### REQ-agent-002
When `verify_before_complete` is on and the execute step reports files changed, EndTurn / completion runs `fledge lanes run verify --non-interactive` (FLEDGE-2/3). Pass → done with `verified=true`. Fail with retries left → re-enter executing with verifier output (AGENT-4.a). Exhausted → clear failure, `verified=false` (AGENT-4).

### REQ-agent-003
`--no-verify` / config off skips the gate (`verify_skipped=true`); cancellation via AbortSignal aborts promptly (AGENT-3).

### REQ-cli-005
CLI surfaces `task run` with `--no-verify`, optional `--max-retries`, and JSON output of TaskResult + state events.
