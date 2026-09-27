---
change: watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log
artifact: plan
---

# Plan

1. Write a regression test, `tests/watch.summary-scrub.test.ts`. Drive
   `startWatchPoller` with a fake bin through `createSpawnAgentClient`, an
   echo ack client and a temp-file `SpawnOutcomeStore`. Cover a token in the
   result frame, the stderr fallback and a thrown spawn error, plus a token cut
   at the clip caps. Show it failing on the old code.
2. Scrub in `buildSummaryBody` and in the poller `summaryPreview`, scrubbing
   before clipping.
3. Add the `REQ-watch-231` delta. Then run typecheck, `bun test`,
   `specsync check` and fledge verify.
