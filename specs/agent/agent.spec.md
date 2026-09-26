---
module: agent
version: 10
status: draft
files:
  - src/agent/types.ts
  - src/agent/config.ts
  - src/agent/verify.ts
  - src/agent/loop.ts
  - src/agent/specLoader.ts
  - src/agent/index.ts

db_tables: []
depends_on:
  - plugins
---

# Agent

## Purpose

Prove-before-done agent task loop with SpecSync-aware Planning briefing and SpecSync check on the verify lane.

## Public API

Also export `selectRelevantSpecs`, `extractConstraintSections`, `loadRelevantSpecs` (or equivalent) from the agent module.

## Invariants

Planning loads specs before execute when possible; SpecSync check participates in done-gate via fledge verify lane; no SpecSync cloud key; no Trust/attest.

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

### Scenario: Planning SpecSync briefing

- **Given** a task description that mentions a registered module
- **When** runTask enters Planning
- **Then** a Text event includes `# Spec: <module>` constraint sections (and companions when present)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Verify exhausted | state failed, verified=false, summary includes verifier output |
| AbortSignal fired | cancelled=true, state failed |
| fledge missing | verify failure output names PATH miss |
| SpecSync registry missing | Planning soft-fails; execute continues |

## Dependencies

Spawns `fledge` for the default verify runner (lane includes `spec-check`). Reads SpecSync registry/specs via plugin helpers. No Trust/attest.

## Change Log

STEAL SpecSync agent wiring: plan-time list/read + verify-lane spec-check (2026-09-26, corvid-agent).
| 2026-09-26 | steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship: STEAL SpecSync agent wiring from Merlin fledge-plugin-specsync: typed list/read/check/brief/coverage + change list/ship-status; Planning companion briefing; SpecSync check blocks prove-before-done (SPECSYNC-1..7); plan-time list/read + verify-lane spec-check; CI Spec Sync Action remains dedicated |
