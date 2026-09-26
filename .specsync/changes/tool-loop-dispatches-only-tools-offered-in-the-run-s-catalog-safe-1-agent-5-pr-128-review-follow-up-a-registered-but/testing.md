---
change: tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but
artifact: testing
---

# Testing

- `tests/agent.tool-loop.test.ts` — not-offered dangerous tool refused even
  interactive + allowlisted; existing offered-tool loop tests unchanged.
- `tests/memory.store.test.ts` — re-store keeps soft-deleted history.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-128 | `tests/agent.tool-loop.test.ts` |
