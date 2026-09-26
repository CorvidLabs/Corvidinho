---
change: cover-leftover-memory-acl-fixture-and-acting-user-wire-paths-for-specsync-audit-after-memory-sqlite-acl-archive-session
artifact: testing
---

# Testing

- `bun test tests/memory.store.test.ts tests/memory.plugins.test.ts tests/version.test.ts tests/update-helpers.test.ts`
- `specsync change audit` clean for PR tip
- `fledge lanes run verify --non-interactive`
