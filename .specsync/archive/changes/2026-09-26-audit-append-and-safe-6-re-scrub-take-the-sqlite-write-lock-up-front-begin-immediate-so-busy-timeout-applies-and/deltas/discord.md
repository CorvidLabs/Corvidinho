---
module: discord
change: audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and
---

# Delta — discord (SAFE-6 re-scrub takes the write lock up front)

## Added

### REQUIREMENT REQ-discord-287

`rescrubDatabase` (the SAFE-6 re-scrub run by `ensureScrubbed` on DB open when
`SCRUB_RULES_VERSION` increases, REQ-discord-066) SHALL take the shared DB
write lock before it reads rows (BEGIN IMMEDIATE), so a concurrent writer or
opener in another process is waited for under the DB busy_timeout instead of
failing at once with "database is locked". No new env var, config key,
pragma, CLI or slash surface.

Acceptance Criteria
- While another process holds the write lock and then commits, `rescrubDatabase` waits, re-scrubs the pending rows and returns their count.
