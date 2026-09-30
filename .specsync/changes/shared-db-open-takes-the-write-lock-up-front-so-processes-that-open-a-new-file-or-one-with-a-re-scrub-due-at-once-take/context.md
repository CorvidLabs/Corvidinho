---
change: shared-db-open-takes-the-write-lock-up-front-so-processes-that-open-a-new-file-or-one-with-a-re-scrub-due-at-once-take
artifact: context
---

# Context

Review of the previous change on this branch
(`shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to`,
REQ-plugins-287 / REQ-discord-287). Its root cause holds: on `origin/main`
with every fsync 20 ms longer (scratch LD_PRELOAD shim) the concurrent
appenders test lost a row in 6 of 6 runs (`{ ok: 39, errors: ["SQLiteError:
database is locked"] }`), and with its fix 0 of 10.

Its open, though, ran the migration and `ensureScrubbed` in one *deferred*
transaction with busy_timeout 0, retried whole on SQLITE_BUSY. Two failures
followed when several processes open the shared file at once:

- **New file**: in a deferred transaction a write after a read gets
  SQLITE_BUSY at once (SQLite skips the busy handler to avoid deadlock).
  bun's multi-statement `exec` reports only its last statement's error, so
  `exec(SCHEMA_V1_SQL)` went on past a busy `CREATE TABLE` and failed on the
  `CREATE INDEX` with "no such table: main.discord_sessions", which is not
  retried: 7 of 8 openers failed in 3 of 3 runs (main: 8 of 8 in).
- **Re-scrub due**: every opener read all rows under SHARED before its first
  write; the one holding the write lock tried its COMMIT once (busy_timeout
  0), failed on another's read, rolled everything back, and so on: with
  10 000 rows 3 of 4 openers failed "database is locked" after 5 s in 3 of 3
  runs (main: all in 31-158 ms).

The same deferred shape could also let the migration's ignored ALTER errors
or the re-scrub's memory-key collision retry swallow a SQLITE_BUSY and go on
with a statement missing.

Constraints: no new env var, config key, pragma, CLI or slash surface; no
raised timeout; SAFE-5 rows must still never be lost to contention.
