---
change: concurrent-audit-appends-from-several-processes-lose-no-safe-5-rows-regression-test-for-req-plugins-287-multi-process
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "concurrent appenders in several processes lose no rows and keep one chain (SAFE-5)" | 4 bun children start together and each opens the shared file DB, appends one audit row and closes it, 40 times (as a dangerous plugin run's `recordAudit` does). Every child reports 40 ok and no errors; `verifyAudit` is ok with 160 rows. With origin/main's `appendAudit` (deferred transaction) swapped in, the test failed 3 of 3 runs with "SQLiteError: database is locked" in the children; restored, it passed 3 of 3. |
| `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "appendAudit waits under busy_timeout and links after the other writer's row (SAFE-5)" | unchanged from PR #211: fails on origin/main, passes with the fix. |
| `REQ-discord-287` | `tests/store.busy-lock.test.ts` "rescrubDatabase waits under busy_timeout instead of failing at once (SAFE-6)" | unchanged from PR #211: fails on origin/main, passes with the fix. |
