---
change: audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and
artifact: design
---

# Design

- `appendAudit`: run the read-prev-hash + INSERT body with
  `db.transaction(fn).immediate()` (BEGIN IMMEDIATE). The write lock is taken
  before the prev-hash SELECT, under busy_timeout, so a concurrent writer is
  waited for and the new row links to the latest committed row.
- `rescrubDatabase`: same change, so concurrent openers after a
  `SCRUB_RULES_VERSION` bump wait for each other instead of failing.
- No schema, pragma, env var, config key, CLI or slash change. Journal mode
  stays as is; WAL for the shared DB is left as a separate follow-up (it
  changes on-disk files and reader/writer behavior beyond this fix).
- If the other writer holds the lock longer than busy_timeout (5 s) the call
  still fails with SQLITE_BUSY, and `runPlugin` still fails closed for a
  `started` row as REQ-plugins-095 requires.
