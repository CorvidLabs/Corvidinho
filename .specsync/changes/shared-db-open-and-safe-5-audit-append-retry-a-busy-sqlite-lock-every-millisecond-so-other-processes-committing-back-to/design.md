---
change: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
artifact: design
---

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
