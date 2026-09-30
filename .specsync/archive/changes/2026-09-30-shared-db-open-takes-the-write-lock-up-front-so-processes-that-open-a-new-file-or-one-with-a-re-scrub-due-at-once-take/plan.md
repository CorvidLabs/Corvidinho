---
change: shared-db-open-takes-the-write-lock-up-front-so-processes-that-open-a-new-file-or-one-with-a-re-scrub-due-at-once-take
artifact: plan
---

# Plan

1. Reproduce the root cause on `origin/main` and confirm the previous
   change's fix under the same slow-fsync stress.
2. Reproduce the concurrent-open failures of the deferred transaction (new
   file, re-scrub due) with a scratch harness.
3. Take the open's write lock up front (BEGIN IMMEDIATE through
   `retryWhileBusy`), body and COMMIT under busy_timeout.
4. Add two regression tests to `tests/store.busy-lock.test.ts` (new file,
   re-scrub due), check they fail on the previous change and pass now.
5. Update REQ-discord-287 / REQ-plugins-287 and the discord spec prose; run
   the full verify.
