---
change: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "appendAudit takes the write lock when another process frees it only briefly, after a long wait (SAFE-5)" | A child takes BEGIN IMMEDIATE, appends a row, holds 970 ms, commits, leaves the lock free 50 ms (between SQLite's tries at ~928 and ~1028 ms), then holds it up to 6.5 s. With the unfixed `src/audit/log.ts` and `src/store/db.ts` it failed 8 of 8 runs (`SQLiteError: database is locked`, `SQLITE_BUSY`, thrown from `.immediate()`); with the fix it passed 8 of 8: the append lands in the free 50 ms, links to the child's row, the chain verifies and busy_timeout is still 5000. |
| `REQ-discord-287` | `tests/store.busy-lock.test.ts` "openCorvidinhoDb gets in when another process frees the file only briefly, after a long wait (SAFE-5)" | Same child with BEGIN EXCLUSIVE (keeps readers out). Unfixed: 8 of 8 runs failed (`openCorvidinhoDb` threw `SQLiteError: database is locked`). Fixed: 8 of 8 passed; the open lands in the free 50 ms, busy_timeout is 5000 and foreign_keys is 1, and an append on it gets seq 2 with the chain ok. |
| `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "concurrent appenders in several processes lose no rows and keep one chain (SAFE-5)" (unchanged) | Stressed loop, 2 parallel workers, every `fsync`/`fdatasync` 10 ms longer through a scratch LD_PRELOAD shim (a slow runner disk): unfixed tree 5 of 20 runs failed (`{ ok: 39, errors: ["SQLiteError: database is locked"] }`, the CI shape); fixed tree, whole file (all five tests), 3 batches of 20: 60 of 60 passed. Without the shim, 4 parallel workers x 10 whole-file runs: 40 of 40 passed. Instrumented children (4 x 40, 20 ms per sync, 160 commits = about 13.6 s): unfixed lost 1-3 rows in 5 of 5 runs (starved in the append and in the open); fixed lost 0 in 10 of 10, longest single open+append about 2 s. |
| `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "appendAudit waits under busy_timeout and links after the other writer's row (SAFE-5)" (unchanged) | Passes with the fix (the append now retries every millisecond while the holder keeps the lock 750 ms). |
| `REQ-discord-287` | `tests/store.busy-lock.test.ts` "rescrubDatabase waits under busy_timeout instead of failing at once (SAFE-6)" (unchanged) | Passes; `rescrubDatabase` called on its own still uses BEGIN IMMEDIATE under busy_timeout. |
| `REQ-discord-287` | full `bun test` | Every test opens its DB through the changed `openCorvidinhoDb` (migration and scrub check in one transaction); the suite passes. |
