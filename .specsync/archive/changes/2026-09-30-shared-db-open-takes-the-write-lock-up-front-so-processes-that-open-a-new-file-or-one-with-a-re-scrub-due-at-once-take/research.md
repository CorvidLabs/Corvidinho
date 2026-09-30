---
change: shared-db-open-takes-the-write-lock-up-front-so-processes-that-open-a-new-file-or-one-with-a-re-scrub-due-at-once-take
artifact: research
---

# Research

- SQLite (`sqlite3BtreeBeginTrans`) calls the busy handler only when the
  connection has no read transaction open, so a deferred transaction that
  read and then needs RESERVED gets SQLITE_BUSY at once whatever
  busy_timeout says.
- bun 1.4.2 (SQLite 3.53.2) `db.exec` with several statements: with another
  connection holding RESERVED and busy_timeout 0,
  `exec("CREATE TABLE t4(x); SELECT 1")` returns without error and creates
  nothing; `exec("CREATE TABLE t1(x); CREATE TABLE t2(y)")` throws
  SQLITE_BUSY (the last statement's error). A later statement that depends
  on a skipped one fails at prepare ("no such table").
- In rollback-journal mode an EXCLUSIVE attempt that fails keeps PENDING,
  which blocks new readers, only while the busy handler keeps retrying; a
  single try followed by ROLLBACK drops it, so a writer committing with
  busy_timeout 0 can be refused by readers indefinitely.
