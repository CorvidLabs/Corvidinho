---
module: plugins
change: audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and
---

# Delta — plugins (audit append takes the write lock up front)

## Added

### REQUIREMENT REQ-plugins-287

`appendAudit` SHALL take the shared DB write lock before it reads the
previous chain hash (BEGIN IMMEDIATE), so a concurrent writer in another
process is waited for under the DB busy_timeout instead of failing at once
with "database is locked", and the new row links to the latest committed row.
A SAFE-5 row for a dangerous run SHALL NOT be lost only because another
process was writing the shared DB. When the lock is not free within
busy_timeout the append still fails, and `runPlugin` still refuses a run
whose `started` row cannot be written (REQ-plugins-095). No new env var,
config key, pragma, slash command or plugin.

Acceptance Criteria
- While another process holds the write lock and then commits, `appendAudit` waits and succeeds; its `prev_hash` is the other writer's row hash and the chain verifies.
- Concurrent appenders in several processes lose no rows.
