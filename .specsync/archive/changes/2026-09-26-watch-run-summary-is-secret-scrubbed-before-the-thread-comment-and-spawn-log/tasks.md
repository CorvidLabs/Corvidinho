---
change: watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log
artifact: tasks
---

# Tasks

- [x] Regression test fails on the old code (raw `ghp_` token in the posted summary comment and the spawn JSONL line: 4/4 fail).
- [x] `buildSummaryBody` scrubs `spawn.summary` with `scrubSecrets` before clipping to 1200 chars (`src/watch/summary.ts`).
- [x] The poller scrubs `summaryPreview` with `scrubSecrets` before clipping to 240 chars and appending to the spawn log (`src/watch/poller.ts`).
- [x] Add the `REQ-watch-231` added delta for the watch module.
- [x] Typecheck, `bun test`, `specsync check --require-coverage 100` and fledge verify are green.
