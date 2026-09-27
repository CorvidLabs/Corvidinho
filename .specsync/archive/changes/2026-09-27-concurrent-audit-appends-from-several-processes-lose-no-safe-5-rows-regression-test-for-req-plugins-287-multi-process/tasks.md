---
change: concurrent-audit-appends-from-several-processes-lose-no-safe-5-rows-regression-test-for-req-plugins-287-multi-process
artifact: tasks
---

# Tasks

- [x] Reproduce the PR #211 bug on origin/main (both busy-lock tests fail with "database is locked").
- [x] Audit every other shared-DB transaction for a deferred read-then-write (none left).
- [x] Add the multi-process append test to `tests/store.busy-lock.test.ts`; it fails with main's `appendAudit` and passes with the fix.
- [x] Delta: REQ-plugins-287 Modified (full text; the multi-process bullet names the per-append open that plugin runs do).
- [x] tsc, full test suite, SpecSync checks and verify lane green.
