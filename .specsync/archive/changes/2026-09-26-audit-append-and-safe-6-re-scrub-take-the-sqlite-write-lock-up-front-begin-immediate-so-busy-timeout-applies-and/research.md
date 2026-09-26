---
change: audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and
artifact: research
---

# Research

- SQLite `sqlite3BtreeBeginTrans` only invokes the busy handler while the
  connection has no transaction open; a deferred transaction that already read
  (SHARED) and then needs RESERVED gets SQLITE_BUSY straight away to avoid a
  deadlock. `BEGIN IMMEDIATE` asks for RESERVED at BEGIN, before any read, so
  the busy handler (busy_timeout) waits for the other writer.
- bun:sqlite `db.transaction(fn)` returns a function with `.deferred`,
  `.immediate` and `.exclusive` variants; nested calls (already in a
  transaction) use SAVEPOINT for every variant, so `.immediate()` is safe
  inside an outer transaction.
- Callers: `runPlugin` (src/plugins/run.ts, started/ok/error/denied rows),
  the Discord bridge denied-close audit (src/discord/bridge.ts), and
  `ensureScrubbed` on every `openCorvidinhoDb`. No caller wraps these in its
  own transaction.
- Repro (4 bun processes x 300 iterations: open file DB, `appendAudit`,
  close): before the fix 1167 of 1200 appends landed and every process
  reported `SQLiteError: database is locked`; after the fix 1200 of 1200,
  chain OK. The chain stayed valid before the fix, so the failures are lost
  rows, not a fork.
