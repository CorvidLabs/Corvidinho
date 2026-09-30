---
change: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
artifact: context
---

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
