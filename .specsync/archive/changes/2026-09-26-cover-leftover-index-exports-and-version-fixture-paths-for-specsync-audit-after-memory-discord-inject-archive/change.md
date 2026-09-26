---
id: cover-leftover-index-exports-and-version-fixture-paths-for-specsync-audit-after-memory-discord-inject-archive
state: archived
type: bug_fix
base_commit: b425f4ab09cc089c33f4914054a9183c68737040
---

# Cover leftover index exports and version fixture paths for SpecSync audit after memory-discord-inject archive

## Intent

Cover leftover index exports and version fixture paths for SpecSync audit after memory-discord-inject archive

## Affected Canonical Specs

- `agent`
- `discord`
- `cli`

## Acceptance Criteria

- src/agent/index.ts re-exports MEMORY_AGENT_SYSTEM_INSTRUCTIONS; src/discord/index.ts re-exports memory-inject helpers; tests/version.test.ts and tests/update-helpers.test.ts assert package 0.0.7 / changelog 0.0.7; covered for SpecSync change audit after memory-discord-inject archive; no new module AC

## No-spec Rationale

Re-export MEMORY_AGENT_SYSTEM_INSTRUCTIONS / memory-inject helpers and version/changelog fixture bumps are already covered by living agent/discord/cli specs from the archived memory-discord-inject change; no new acceptance criteria.
