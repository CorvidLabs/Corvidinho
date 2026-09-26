---
module: agent
version: 4
status: draft
files:
  - src/agent/types.ts
  - src/agent/config.ts
  - src/agent/verify.ts
  - src/agent/loop.ts
  - src/agent/index.ts

db_tables: []
depends_on: []
---

# Agent

## Purpose

Prove-before-done agent task loop: refuse done until project verify lane passes.

## Public API

Export AgentState, AgentEvent, TaskResult, runTask, loadAgentConfig, defaultVerifyRunner.

## Invariants

No claim of done with verified=true unless verify passed or was skipped; max_retries respected; no Trust/attest invented.

## Behavioral Examples

### Scenario: Verify pass

- **Given** verify_before_complete is on and execute reports files changed
- **When** verify runner returns success
- **Then** TaskResult has verified=true and state done

### Scenario: Verify fail with retry then pass

- **Given** first verify fails and retries remain
- **When** execute runs again with verifyFeedback and second verify passes
- **Then** TaskResult has verified=true and attempts >= 2

### Scenario: Skip verify

- **Given** --no-verify or empty filesChanged
- **When** runTask completes
- **Then** verifySkipped=true and verify runner is not called

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Verify exhausted | state failed, verified=false, summary includes verifier output |
| AbortSignal fired | cancelled=true, state failed |
| fledge missing | verify failure output names PATH miss |

## Dependencies

Spawns `fledge` for the default verify runner. No Trust/attest.

## Change Log

STEAL prove-before-done gate (AGENT-4 / FLEDGE-2) (2026-09-26, corvid-agent).
| 2026-09-26 | steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing: STEAL prove-before-done agent loop: refuse done until fledge verify passes (AGENT-4 / FLEDGE-2); states planning/executing/verifying/done; CLI --no-verify; config verify_before_complete |
