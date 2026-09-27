---
change: lightly-adopt-agent-3md-ship-guidance-only-agent-3md-plus-corvidlabs-agent3md-dep-and-validate-route-smoke-no-agent-13
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| REQ-agent-260 | `tests/agent3md.smoke.test.ts` | validateAgent, route/get, no tool= bindings, dep present |

## Automated coverage

- `bun test tests/agent3md.smoke.test.ts`
- `fledge lanes run verify --non-interactive`
