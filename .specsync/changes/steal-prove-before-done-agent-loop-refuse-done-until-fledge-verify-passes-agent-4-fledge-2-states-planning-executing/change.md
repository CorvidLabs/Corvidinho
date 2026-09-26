---
id: steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing
state: implementing
type: feature
base_commit: 33a6c7f74ef2c2521c5c6ea2de8e552551552e0c
---

# STEAL prove-before-done agent loop: refuse done until fledge verify passes (AGENT-4 / FLEDGE-2); states planning/executing/verifying/done; CLI --no-verify; config verify_before_complete

## Intent

STEAL prove-before-done agent loop: refuse done until fledge verify passes (AGENT-4 / FLEDGE-2); states planning/executing/verifying/done; CLI --no-verify; config verify_before_complete

## Affected Canonical Specs

- `agent`
- `cli`

## Acceptance Criteria

- Task that fails verify is not reported done (verified=false); with retries, failure stdout/stderr is fed back and another execute attempt runs; exhausted retries → clear failure; --no-verify skips gate (verify_skipped); shell fledge lanes run verify and agent gate agree; AGENT-8 states planning/executing/verifying/done|failed emitted; cancellation aborts promptly; bun test + fledge verify green

## No-spec Rationale

Not applicable
