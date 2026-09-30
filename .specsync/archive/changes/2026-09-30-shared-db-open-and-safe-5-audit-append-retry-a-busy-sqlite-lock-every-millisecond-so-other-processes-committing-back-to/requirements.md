---
change: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
artifact: requirements
---

# Requirements

- SAFE-5 (`hi/safe.md`, complete audit trail) via REQ-plugins-287: a SAFE-5
  row for a dangerous run SHALL NOT be lost only because another process was
  writing the shared DB; acceptance "concurrent appenders in several
  processes lose no rows" and "several processes that each open the shared
  DB file, append one row and close it ... get every append in".
- Modified: REQ-plugins-287 (the append retries its lock every millisecond
  up to busy_timeout; new acceptance bullet for a lock freed briefly after a
  long wait), REQ-discord-287 (the open runs migration and scrub check in one
  transaction retried every millisecond up to busy_timeout; new acceptance
  bullet for the open).
- Kept: REQ-plugins-095 (fail closed when `started` cannot be written),
  REQ-discord-095 (busy timeout on the shared DB), REQ-discord-066 (re-scrub
  on rules bump), busy_timeout 5000.
- No new env var, config key, pragma, CLI, slash command, plugin, table or
  schema version. No hi/ capture (no new want; SAFE-5 as captured).
