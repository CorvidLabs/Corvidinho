---
change: audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and
artifact: tasks
---

# Tasks

- [x] Regression test fails before the fix (2/2: `appendAudit` and `rescrubDatabase` throw "database is locked").
- [x] `appendAudit` and `rescrubDatabase` use BEGIN IMMEDIATE (`db.transaction(fn).immediate()`).
- [x] Deltas REQ-plugins-287 / REQ-discord-287 and plugins spec file list updated.
- [x] tsc, full test suite, SpecSync checks and verify lane green.
