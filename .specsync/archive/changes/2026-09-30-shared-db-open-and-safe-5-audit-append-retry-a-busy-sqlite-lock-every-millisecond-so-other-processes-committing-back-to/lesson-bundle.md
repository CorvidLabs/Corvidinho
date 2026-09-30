# Lesson bundle — shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Shared DB open and SAFE-5 audit append retry a busy SQLite lock every millisecond, so other processes committing back to back cannot pass them over for the whole busy_timeout and lose audit rows
- **Kind**: BugFix
- **Specs**: plugins, discord
- **Paths**: src/audit/log.ts, src/store/db.ts, tests/store.busy-lock.test.ts
- **Acceptance**: While another process holds the shared DB write lock for about a second then frees it for 50 ms and keeps it past busy_timeout appendAudit takes the lock while it is free and the chain verifies (before the fix it failed with database is locked)
- **Acceptance**: While another process holds the shared DB file exclusively for about a second then frees it for 50 ms and keeps it past busy_timeout openCorvidinhoDb opens while it is free and keeps busy_timeout 5000 and foreign_keys on (before the fix it failed with database is locked)
- **Acceptance**: Four processes that each open the shared DB and append one SAFE-5 row 40 times at once lose no rows and keep one chain when every fsync takes 10 ms longer (before the fix 5 of 20 runs lost a row)

## Evidence

- Verification commit: `b5e4c9a4f2c8f51900eb93576cbe41ff0397b9b3`
- Base commit: `507d97b75b08ebe86c5e0c5ab19322ea82d683cb`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

# Context

`tests/store.busy-lock.test.ts` "concurrent appenders in several processes
lose no rows and keep one chain (SAFE-5)" failed in CI smoke on PR #320
(head 94c20e6, run 36729963046 attempt 1, 7650.95 ms) and on
claude/m1-101-forget-github (cf8ac45, run 36665216215, 9068.78 ms), and
passed on re-run. On a normal runner it takes about 1.7 s (main, run
36611665248). Both failing jobs were on slow runners (the whole `bun test`
step took about 180 s, against about 95 s on the re-runs). The other recent
red smoke runs fail other tests (bun:test 5 s timeouts in node-exec,
SessionStore turns, update-helpers, startDaemon, an OPS-1 snapshot test, and
one run with 41 discord failures), not this one.

This test guards REQ-plugins-287: a dangerous plugin run opens the shared DB,
appends its SAFE-5 row and closes it; a row must not be lost only because
other processes write the DB. A failure here is a lost audit row, so it was
root-caused, not re-run.

Constraints: rollback-journal mode stays (no WAL: REQ-plugins-287 allows no
new pragma, and backups/snapshots rely on the single file). bun:sqlite
exposes no `sqlite3_busy_handler` (the bun binary exports no sqlite3
symbols), so SQLite's own handler cannot be replaced; retries must be in JS
with busy_timeout set to 0 while they run. Raising busy_timeout does not fix
it: the wait is bounded by the other processes' total writing, not by a fair
share.

## From the change's design.md

# Design

- **`retryWhileBusy(db, fn)`** (`src/store/db.ts`, exported): reads the
  connection's busy_timeout; if it is 0, runs `fn` once (as before).
  Otherwise sets busy_timeout 0, runs `fn`, and while it throws a
  `SQLITE_BUSY*` error runs it again after `Bun.sleepSync(1)` until the
  deadline (busy_timeout from the first try) has passed, then rethrows. Any
  other error is thrown at once. busy_timeout is restored in `finally`.
  `fn` must leave nothing behind when it fails with SQLITE_BUSY (one
  statement, a BEGIN, or a whole transaction that rolls back).
- **Open** (`openCorvidinhoDb`, file DBs only): busy_timeout 5000, then
  `PRAGMA foreign_keys = ON` (a no-op inside a transaction, so first), then
  `retryWhileBusy(db, () => db.transaction(() => { migrate; ensureScrubbed })())`.
  One transaction holds one SHARED lock across every migration read, so an
  open needs one free moment instead of about ten. A migration or an on-open
  re-scrub that must write upgrades inside the transaction; a BUSY there
  rolls the whole transaction back and it is tried again, so it stays atomic.
  `:memory:` opens are unchanged.
- **Append** (`appendAudit`): outside a transaction, only
  `BEGIN IMMEDIATE` goes through `retryWhileBusy`; the body and COMMIT
  run with busy_timeout restored (a committing writer holds PENDING, so new
  readers cannot keep it waiting, and SQLite's short first sleeps suffice).
  A body or COMMIT error rolls back and rethrows, as bun's `.immediate()`
  wrapper did. Inside a caller's transaction the append is a savepoint of it
  (`db.transaction(fn)()`), as before.
- **Why 1 ms**: `Bun.sleepSync` truncates fractions, so 1 ms is the
  shortest sleep; a failed BEGIN costs a few syscalls. Waiters now try on
  the same time scale as a writer re-takes the lock, so lock hand-offs
  interleave (measured: 129-153 hand-offs per 160 appends, longest run 2-12,
  against 4-10 hand-offs and runs of up to 40 before). The overall wait is still
  bounded by busy_timeout; no timeout was raised.
- **Not changed**: other `.immediate()` writers (spend, approvals,
  scheduler, backup, forget, `rescrubDatabase` called on its own) keep
  SQLite's handler; they are not on the SAFE-5 open-and-append path and fail
  visibly. They can adopt `retryWhileBusy` later.

**Follow-up (same PR):** change `shared-db-open-takes-the-write-lock-up-front-so-processes-that-open-a-new-file-or-one-with-a-re-scrub-due-at-once-take` makes the open take the write
lock up front (BEGIN IMMEDIATE through `retryWhileBusy`) instead of
retrying a whole deferred transaction: in a deferred transaction a write
after a read gets SQLITE_BUSY at once, which the migration's
multi-statement execs and ignored ALTER errors went on past, so concurrent
opens of a new file or with a re-scrub due failed. The requirement deltas
above carry the final REQ-discord-287 / REQ-plugins-287 text of both
changes, so checking either one keeps the same canonical text.

## From the change's testing.md

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

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`
