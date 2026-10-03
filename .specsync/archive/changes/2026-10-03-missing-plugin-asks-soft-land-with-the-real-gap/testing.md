---
change: missing-plugin-asks-soft-land-with-the-real-gap
artifact: testing
---

# Testing

- `bun test tests/agent.missing-capability.test.ts`
- Adjacent: `bun test tests/agent.tool-loop.test.ts tests/agent.soft-land.test.ts tests/agent.ask.test.ts tests/must-ask.boundary.test.ts tests/agent.allowlisted-dangerous.test.ts`

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-742 | `tests/agent.missing-capability.test.ts` |
| acceptance: concrete gap, no invented provider, no vague install ask | same file: install gif plugin does not call the model; summary has the gap, cited HI/PR, no question mark |
| acceptance: offered tool is not replaced | same file: dog GIFs with gif-search offered calls the model |
| acceptance: community stays read/chat | same file: community role gap does not mention CORVIDINHO_ALLOWLIST |
