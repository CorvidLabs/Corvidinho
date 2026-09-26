---
module: agent
change: steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing
---

# Delta — agent (prove-before-done)

## Added

### REQUIREMENT REQ-agent-001

The system SHALL expose task states idle, planning, executing, verifying, done, and failed (AGENT-8).

Acceptance Criteria
- `runTask` emits `StateChanged` for planning → executing → verifying → done|failed.
- `TaskResult` includes `state` reflecting the terminal state.

### REQUIREMENT REQ-agent-002

When `verify_before_complete` is enabled and the execute step reports files changed, completion SHALL run `fledge lanes run verify --non-interactive`. Pass → `verified=true`. Fail with retries remaining → re-enter executing with verifier output. Exhausted retries → terminal failure with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2).

Acceptance Criteria
- Mock verify fail then pass within max_retries yields `verified=true` and a second execute call that receives feedback.
- Exhausted retries yield `verified=false` and failed state.
- Default runner invokes fledge with `lanes run verify --non-interactive`.

### REQUIREMENT REQ-agent-003

`--no-verify` or config `verify_before_complete=false` SHALL skip the gate (`verify_skipped=true`). Cancellation via AbortSignal SHALL abort promptly (AGENT-3).

Acceptance Criteria
- Skip path never calls verify runner; `verified=false`, `verify_skipped=true`.
- Aborted signal during/before verify returns `cancelled=true`.

## Modified

### SPEC SECTION Purpose

Prove-before-done agent task loop: refuse done until project verify lane passes.

### SPEC SECTION Public API

Export AgentState, AgentEvent, TaskResult, runTask, loadAgentConfig, defaultVerifyRunner.

### SPEC SECTION Invariants

No claim of done with verified=true unless verify passed or was skipped; max_retries respected; no Trust/attest invented.

### SPEC SECTION Change Log

STEAL prove-before-done gate (AGENT-4 / FLEDGE-2) (2026-09-26, corvid-agent).
