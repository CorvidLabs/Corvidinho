---
change: shared-db-open-takes-the-write-lock-up-front-so-processes-that-open-a-new-file-or-one-with-a-re-scrub-due-at-once-take
artifact: tasks
---

# Tasks

- [x] Reproduce the root cause on `origin/main` (slow fsync shim) and confirm the previous fix.
- [x] Reproduce the new-file and re-scrub-due concurrent-open failures of the deferred open.
- [x] `openCorvidinhoDb`: BEGIN IMMEDIATE through `retryWhileBusy`; body and COMMIT under busy_timeout.
- [x] `retryWhileBusy` comment: one statement or a BEGIN IMMEDIATE, not a deferred transaction.
- [x] Regression tests for concurrent opens of a new file and of one with a re-scrub due.
- [x] REQ-discord-287 / REQ-plugins-287 deltas and discord spec prose.
- [x] Full verify.
