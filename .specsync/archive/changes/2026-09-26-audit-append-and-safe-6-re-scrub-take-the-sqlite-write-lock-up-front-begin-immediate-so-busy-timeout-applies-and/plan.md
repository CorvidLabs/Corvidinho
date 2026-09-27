---
change: audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and
artifact: plan
---

# Plan

1. Regression test first (tests/store.busy-lock.test.ts): a child bun process
   holds the shared DB write lock (BEGIN IMMEDIATE + one audit row), then
   commits; the parent's `appendAudit` and `rescrubDatabase` must wait and
   succeed. Watch both fail with "database is locked".
2. Switch `appendAudit` and `rescrubDatabase` to
   `db.transaction(fn).immediate()`.
3. Deltas REQ-plugins-287 and REQ-discord-287; list the new test file in the
   plugins spec.
4. tsc, full test suite, SpecSync checks and the verify lane.
