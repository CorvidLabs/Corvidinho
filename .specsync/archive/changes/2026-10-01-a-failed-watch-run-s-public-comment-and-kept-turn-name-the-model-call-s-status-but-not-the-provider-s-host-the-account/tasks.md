---
change: a-failed-watch-run-s-public-comment-and-kept-turn-name-the-model-call-s-status-but-not-the-provider-s-host-the-account
artifact: tasks
---

# Tasks

- [x] `watchPublicFailureLine` in `src/watch/summary.ts`, used by
  `buildSummaryBody`.
- [x] Kept turn uses the public line in `src/watch/poller.ts`; the log keeps
  the host.
- [x] Tests in `tests/watch.failed-comment.test.ts` (end to end, body, every
  shape, cut host, untouched lines); fail on the branch head, pass here.
- [x] Deltas for REQ-watch-009 and REQ-watch-472; `docs/WATCH.md`,
  `specs/watch/watch.spec.md`, `specs/watch/testing.md`.
- [x] Change check, coverage, `hi check`, `tsc`, `bun test`, verify lane.
