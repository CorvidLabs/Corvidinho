---
change: memory-plugins-treat-the-configured-owner-as-admin-identity-1-42-companion-the-handler-time-admin-re-check-for-memory
artifact: testing
---

# Testing

- `tests/memory.plugins.test.ts`: owner + bit ⇒ forget phase 1 ok; owner without bit, other id, muted owner ⇒ not authorized.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-042 | `tests/memory.plugins.test.ts` |
