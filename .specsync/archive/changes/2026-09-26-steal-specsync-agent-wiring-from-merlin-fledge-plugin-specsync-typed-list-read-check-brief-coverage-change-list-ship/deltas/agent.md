---
module: agent
change: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
---

# Delta — agent (SpecSync plan-time briefing)

## Added

### REQUIREMENT REQ-agent-004

During Planning, `runTask` SHALL load relevant module specs via SpecSync list/read (Merlin `spec_loader` pattern): token-overlap select top modules from the task text, extract Purpose/Invariants/Public API/Error Cases, and include companion briefing files when present (SPECSYNC-1/5). Soft-fail if registry or SpecSync tooling is unavailable.

Acceptance Criteria
- Task text mentioning a registered module produces Planning `Text` that includes `# Spec: <module>`.
- Companion files (`context.md`, `tasks.md`, …) appear in the briefing when present on disk.
- Missing registry does not fail the task; Planning continues.

### REQUIREMENT REQ-agent-005

Prove-before-done verify lane SHALL include SpecSync check (`spec-check` on `lanes.verify`) so SpecSync check failures block `verified=true` (SPECSYNC-2/7). CI Spec Sync Action remains a separate workflow.

Acceptance Criteria
- `fledge.toml` `[lanes.verify]` steps include `spec-check`.
- Default verify runner argv stays `lanes run verify --non-interactive` (spec-check runs inside the lane).

## Modified

### SPEC SECTION Purpose

Prove-before-done agent task loop with SpecSync-aware Planning briefing and SpecSync check on the verify lane.

### SPEC SECTION Public API

Also export `selectRelevantSpecs`, `extractConstraintSections`, `loadRelevantSpecs` (or equivalent) from the agent module.

### SPEC SECTION Invariants

Planning loads specs before execute when possible; SpecSync check participates in done-gate via fledge verify lane; no SpecSync cloud key; no Trust/attest.

### SPEC SECTION Change Log

STEAL SpecSync agent wiring: plan-time list/read + verify-lane spec-check (2026-09-26, corvid-agent).
