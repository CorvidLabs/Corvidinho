---
change: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
artifact: research
---

# Research

- CI: `mcp__github__get_job_logs` on every red ci run since 2026-09-29.
  This test failed in runs 36729963046 (attempt 1) and 36665216215 only; the
  failing assertion line is beyond the 5000-line log tail the API returns,
  so it was reproduced locally.
- Local CPU pressure alone (4 parallel loops, 6 busy loops, 200 runs) did
  not reproduce it: this box's fsync takes about 0.2 ms. An LD_PRELOAD shim
  (test-only, scratch) that adds a delay to `fsync`/`fdatasync` models a
  slow runner disk; bun links libc dynamically, so its SQLite's syncs go
  through the shim. With 10 ms per sync a commit takes about 42 ms and the
  unchanged test fails with the CI shape:
  `expect(r).toEqual({ ok: 40, errors: [] })` received
  `{ ok: 39, errors: ["SQLiteError: database is locked"] }`.
- Instrumented children (per-append time, failing step, row order by
  process): the loser fails on its first append after 5010 ms while the other
  three processes append all 40 rows each in unbroken streaks
  (`x40 x40 x40`). The chain never forks: rows are only missing.
- SQLite's default busy handler (sqlite3_busy_timeout) sleeps 1, 2, 5, 10,
  15, 20, 25, 25, 25, 50, 50 ms and then 100 ms between tries (tries at 228,
  328, ... 928, 1028 ms). In rollback-journal mode a commit takes EXCLUSIVE
  for its whole sync (`syncJournal` takes the exclusive lock before the
  journal fsync), and a writer that has just committed closes, reopens and
  runs BEGIN IMMEDIATE again within about 0.6 ms. So the file is free only for
  sub-millisecond moments while others write, and a waiter trying every
  100 ms misses them until busy_timeout ends.
- Retrying only `appendAudit`'s BEGIN every millisecond (first attempt)
  moved the starvation to the open: `openCorvidinhoDb`'s first migration
  statement (`CREATE TABLE IF NOT EXISTS schema_meta`, a schema read) failed
  with SQLITE_BUSY after 5008 ms. Each autocommit statement of the open needs
  its own free moment, and a committing writer blocks readers too. Unfixed
  runs at 20 ms per sync also lost rows in the open.
