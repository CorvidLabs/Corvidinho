---
module: plugins
change: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
---

# Delta — plugins (SAFE-5 append retries a busy lock every millisecond)

## Modified

### REQUIREMENT REQ-plugins-287

`appendAudit` SHALL take the shared DB write lock before it reads the
previous chain hash (BEGIN IMMEDIATE), so a concurrent writer in another
process is waited for under the DB busy_timeout instead of failing at once
with "database is locked", and the new row links to the latest committed row.
While it waits it SHALL try the lock again every millisecond until
busy_timeout has passed, not only at SQLite's busy-handler back-off (one try
per 100 ms), so other processes that commit back to back cannot pass it over
for the whole busy_timeout while the lock is free between their commits.
A SAFE-5 row for a dangerous run SHALL NOT be lost only because another
process was writing the shared DB. When the lock is not free within
busy_timeout the append still fails, and `runPlugin` still refuses a run
whose `started` row cannot be written (REQ-plugins-095). No new env var,
config key, pragma, slash command or plugin.

Acceptance Criteria
- While another process holds the write lock and then commits, `appendAudit` waits and succeeds; its `prev_hash` is the other writer's row hash and the chain verifies.
- Concurrent appenders in several processes lose no rows.
- Several processes that each open the shared DB file, append one row and close it (as dangerous plugin runs do), all at once, get every append in and the chain verifies.
- While another process holds the write lock for about a second, frees it for 50 ms and then holds it past busy_timeout, `appendAudit` takes the lock while it is free; its row links to the other process's row, the chain verifies and the connection keeps its busy_timeout.
