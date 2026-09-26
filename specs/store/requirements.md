---
spec: store.spec.md
---

## User Stories

- As Leif, Corvidinho keeps session/work stubs in a local SQLite file under
  `~/.local/share/corvidinho/` so a bridge restart does not wipe them (SESSION
  durable substrate; MEMORY path alignment).

## Acceptance Criteria

### REQ-store-001

The system SHALL resolve a shared data directory defaulting to
`~/.local/share/corvidinho/` (override `CORVIDINHO_DATA_DIR`) and open a
`bun:sqlite` database at `{dataDir}/corvidinho.db` with schema for Discord
sessions, bot-message maps, and work tasks. Soft TTL helpers SHALL default to
45 minutes and clamp overrides to 30–60 minutes (SESSION-2). This module SHALL
NOT implement MEMORY ACL, conversation recall, or /schedule.

Acceptance Criteria
- resolveDataDir / openCorvidinhoDb / resolveSessionTtlMs behave as above.
- Fixture tests cover paths, TTL clamp, and DB migrate without live Discord.
