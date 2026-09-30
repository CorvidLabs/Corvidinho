---
module: discord
change: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
---

# Delta — discord (shared DB open waits once, retrying every millisecond)

## Modified

### REQUIREMENT REQ-discord-287

`rescrubDatabase` (the SAFE-6 re-scrub run by `ensureScrubbed` on DB open when
`SCRUB_RULES_VERSION` increases, REQ-discord-066) SHALL take the shared DB
write lock before it reads rows (BEGIN IMMEDIATE) when it is called on its
own, so a concurrent writer or opener in another process is waited for under
the DB busy_timeout instead of failing at once with "database is locked".
`openCorvidinhoDb` SHALL run the migration and `ensureScrubbed` in one
transaction that takes the shared DB write lock up front (BEGIN IMMEDIATE;
an on-open re-scrub is a savepoint in it) and, while the lock is taken,
SHALL try that BEGIN again every millisecond until busy_timeout has passed,
so an open (such as a dangerous plugin run's before its SAFE-5 append,
REQ-plugins-287) waits for the lock once, not once per statement, and other
processes that commit back to back cannot pass it over for the whole
busy_timeout, as SQLite's busy-handler back-off (one try per 100 ms) did.
Holding the lock, no statement of the migration or re-scrub fails part way
with SQLITE_BUSY, and the COMMIT waits under busy_timeout for current
readers only, so several processes that open the file at once (a new file,
a schema migration or a re-scrub due) take turns instead of failing. The
opened connection keeps busy_timeout 5000 and foreign_keys on. No new env
var, config key, pragma, CLI or slash surface.

Acceptance Criteria
- While another process holds the write lock and then commits, `rescrubDatabase` waits, re-scrubs the pending rows and returns their count.
- While another process holds the shared DB file exclusively for about a second, frees it for 50 ms and then holds it past busy_timeout, `openCorvidinhoDb` opens while it is free; the connection keeps busy_timeout 5000 and foreign_keys on, and an audit row appended on it links to the other process's row and the chain verifies.
- Several processes that open a new shared DB file at once all get in, and the file ends at the current schema version.
- Several processes that open a shared DB file with a re-scrub due at once all get in; the stored secret is redacted and the current scrub rules version is recorded.
