---
change: cover-leftover-index-exports-and-version-fixture-paths-for-specsync-audit-after-memory-discord-inject-archive
artifact: testing
---

# Testing

- `bun test tests/version.test.ts tests/update-helpers.test.ts tests/discord.memory-inject.test.ts`
- `specsync change audit` reports no uncovered meaningful paths
- `fledge lanes run verify --non-interactive`
