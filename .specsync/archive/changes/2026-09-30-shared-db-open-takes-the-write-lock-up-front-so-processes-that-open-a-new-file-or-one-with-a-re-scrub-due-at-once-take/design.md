---
change: shared-db-open-takes-the-write-lock-up-front-so-processes-that-open-a-new-file-or-one-with-a-re-scrub-due-at-once-take
artifact: design
---

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
