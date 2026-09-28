---
change: concurrent-audit-appends-from-several-processes-lose-no-safe-5-rows-regression-test-for-req-plugins-287-multi-process
artifact: context
---

# Context

Adversarial review of PR #211 (`appendAudit` and `rescrubDatabase` take the
shared-DB write lock up front with BEGIN IMMEDIATE so busy_timeout applies).
The bug reproduces on origin/main: with another process holding RESERVED, a
deferred BEGIN + SELECT + INSERT fails at once with "database is locked"
because SQLite does not call the busy handler when upgrading an open read
transaction. The fix is correct and complete: every other `db.transaction`
on the shared DB either starts with a write (`watch/session-store.ts`
persist, `watch/dedup.ts` addMany — probed: those wait under busy_timeout)
or already uses `.immediate()` (`agent/spend.ts`, `agent/spend-alerts.ts`).
`migrateCorvidinhoDb` runs each statement in autocommit, so it has no
read-then-write upgrade either.

The gap: REQ-plugins-287's second acceptance bullet ("concurrent appenders
in several processes lose no rows") was backed only by a manual stress run
that was not committed. This change adds that test. No production code
changes; the archived PR #211 change keeps the fix and its REQs.

Measured: 4 processes x 40 open/append/close on one file DB. With main's
`appendAudit` swapped in, every run lost rows ("database is locked" in the
children); with the fix, 160/160 rows and the chain verifies.
