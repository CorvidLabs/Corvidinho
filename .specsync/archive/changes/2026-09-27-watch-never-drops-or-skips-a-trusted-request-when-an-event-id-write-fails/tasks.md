---
change: watch-never-drops-or-skips-a-trusted-request-when-an-event-id-write-fails
artifact: tasks
---

# Tasks

- [x] Regression tests that fail on the PR #195 sources (flaky first id write; failing acked/summarized id write).
- [x] Poller: only a routing failure is marked in the per-event catch; a failed id write leaves the event for the next cycle.
- [x] `maybePostWatchAck` / `maybePostWatchSummary`: id write after the posted comment is logged, not thrown.
- [x] Delta: Modified REQ-watch-247; `specs/watch/requirements.md` and `specs/watch/testing.md` updated.
