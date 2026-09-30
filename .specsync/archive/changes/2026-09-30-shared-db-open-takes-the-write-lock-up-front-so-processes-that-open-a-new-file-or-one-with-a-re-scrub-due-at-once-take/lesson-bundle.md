# Lesson bundle — shared-db-open-takes-the-write-lock-up-front-so-processes-that-open-a-new-file-or-one-with-a-re-scrub-due-at-once-take

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Shared DB open takes the write lock up front, so processes that open a new file or one with a re-scrub due at once take turns instead of failing part way
- **Kind**: BugFix
- **Specs**: discord, plugins
- **Paths**: src/store/db.ts, tests/store.busy-lock.test.ts
- **Acceptance**: Six processes that open a new shared DB file at once and append one SAFE-5 row each all get in and the file ends at the current schema version with the chain verified (before the fix five of them failed with no such table)
- **Acceptance**: Four processes that open a shared DB file with a re-scrub due at once and append one row each all get in and the re-scrub redacts the stored secret and records the rules version with the chain verified (before the fix three of them failed with database is locked after 5 s)
- **Acceptance**: The brief-release open and append tests and the concurrent appenders test still pass also with every fsync 20 ms longer

## Evidence

- Verification commit: `b5e4c9a4f2c8f51900eb93576cbe41ff0397b9b3`
- Base commit: `24f70ecdca39ffa74e1645185baf7cc9882982ca`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

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

## From the change's design.md

# Design

- **Open** (`openCorvidinhoDb`, file DBs): after busy_timeout 5000 and
  `foreign_keys = ON`, `retryWhileBusy(db, () => db.exec("BEGIN IMMEDIATE"))`
  takes the write lock, tried every millisecond up to busy_timeout (the
  previous change's retry, unchanged). Then `migrateCorvidinhoDb`,
  `ensureScrubbed` and `COMMIT` run with busy_timeout restored; any error
  rolls back and is rethrown. This is the shape `appendAudit` already uses.
- **Why IMMEDIATE**: holding RESERVED, no read or write in the body can get
  SQLITE_BUSY, so nothing in the migration or re-scrub can swallow one, and
  concurrent openers are serialized by the lock instead of racing deferred
  upgrades. The COMMIT (only an open that wrote needs EXCLUSIVE) holds
  PENDING, so new readers cannot keep it waiting; it waits under
  busy_timeout for current readers only.
- **Tried and rejected**: keeping the deferred transaction and only moving
  the COMMIT under busy_timeout fixed the re-scrub case (all in 46-95 ms)
  but not the new-file case (still 7 of 8 "no such table").
- **Cost**: an open that has nothing to migrate takes RESERVED for the
  migration's reads (well under a millisecond) and commits nothing (no
  journal, no fsync). Opens now wait for another process's write
  transaction instead of reading beside it; those are short in this code
  base. `openCorvidinhoDb` was never usable on a read-only file (a migration
  or re-scrub writes); read-only readers open `new Database(..., { readonly:
  true })` directly and are unchanged.
- `retryWhileBusy`'s comment now says `fn` must be one statement or a BEGIN
  IMMEDIATE, not a deferred transaction.
- `:memory:` opens and `appendAudit` are unchanged.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-287`, `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "processes that open a new shared DB file at once all get in and append (SAFE-5)" | Six APPENDER children open a new file at the same moment and append one row each. With the previous change's `src/store/db.ts` (deferred transaction) it failed 3 of 3 runs in about 0.42 s: five children reported `SQLiteError: no such table: main.discord_sessions`. With `origin/main`'s code it passed 2 of 2; with this fix 5 of 5: every append lands, the file is at `SCHEMA_VERSION` and the chain verifies. |
| `REQ-discord-287`, `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "processes that open a shared DB file with a re-scrub due at once all get in and append (SAFE-6)" | 10 000 `discord_work_tasks` rows (one holding a GitHub-token-shaped secret), `scrub_rules_version` set to 0, then four APPENDER children open at once. Previous change: failed 3 of 3 runs after about 5.5 s (`SQLiteError: database is locked`). `origin/main`: passed 2 of 2; this fix: 5 of 5; the secret is redacted, `SCRUB_RULES_VERSION` is recorded and the chain verifies. |
| `REQ-discord-287` | `tests/store.busy-lock.test.ts` "openCorvidinhoDb gets in when another process frees the file only briefly, after a long wait (SAFE-5)" (unchanged) | Still fails on `origin/main` (3 of 3, database is locked after about 5.1 s) and passes with this fix (20 of 20 under six CPU spinners). |
| `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "concurrent appenders in several processes lose no rows and keep one chain (SAFE-5)" (unchanged, now through the shared `runAppenders` helper) | Every fsync/fdatasync 20 ms longer (scratch LD_PRELOAD shim): `origin/main` lost a row in 6 of 6 runs (`{ ok: 39, errors: ["SQLiteError: database is locked"] }`), 10 ms: 3 of 12; this fix, whole file (seven tests) at 20 ms: 8 of 8 runs passed; without the shim 10 of 10. |
| `REQ-discord-287` | scratch harness (not in the suite): 8 processes opening a new file; 4 or 8 opening one with a re-scrub due over 4 000 or 10 000 rows | Previous change: new file 7 of 8 failed in 3 of 3 runs; re-scrub due (10 000 rows) 3 of 4 (4 procs) and 7 of 8 (8 procs) failed. Deferred transaction with only the COMMIT under busy_timeout: re-scrub due all in (46-95 ms), new file still 7 of 8 failed. This fix: all in, new file (5 of 5 runs, 2 more with 10 ms fsync), re-scrub due 58-225 ms (`origin/main` 31-158 ms). |
| `REQ-discord-287` | full `bun test` | Every test opens its DB through the changed `openCorvidinhoDb`; the suite passes. |

## Where these lessons go

- `specs/discord/context.md`
- `specs/plugins/context.md`
