---
id: lightly-adopt-agent-3md-ship-guidance-only-agent-3md-plus-corvidlabs-agent3md-dep-and-validate-route-smoke-no-agent-13
state: archived
type: feature
base_commit: 9973a2753d922d3b9871c381d650e0374f0ee8d9
---

# Lightly adopt agent.3md: ship guidance-only agent.3md plus @corvidlabs/agent3md dep and validate/route smoke; no AGENT-13 runtime wiring

## Intent

Lightly adopt agent.3md: ship guidance-only agent.3md plus @corvidlabs/agent3md dep and validate/route smoke; no AGENT-13 runtime wiring

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- agent.3md at repo root validates with validateAgent; Agent.route and Agent.get work for guidance-only skill planes in a bun smoke test; package depends on @corvidlabs/agent3md; no tool= bindings that duplicate SAFE plugins; no AGENT-13 runtime loop wiring

## No-spec Rationale

Not applicable
