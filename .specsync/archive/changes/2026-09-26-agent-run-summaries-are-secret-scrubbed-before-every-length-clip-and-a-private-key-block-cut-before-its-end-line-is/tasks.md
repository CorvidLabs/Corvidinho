---
change: agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is
artifact: tasks
---

# Tasks

- [x] Regression tests fail on the current branch code (8/8: 4 in `tests/agent.summary-scrub.test.ts`, 2 in `tests/store.scrub.test.ts`, 2 in `tests/watch.summary-scrub.test.ts`).
- [x] `task-summary.ts` scrubs the result summary, non-frame stdout and stderr before the 1800/500 clips.
- [x] `resultFrame` scrubs an over-long summary before the 4000 cap; within the cap the TaskResult is unchanged.
- [x] The `private-key` scrub pattern redacts a block with no END line through the next BEGIN line or end of text; `SCRUB_RULES_VERSION` is 2.
- [x] Reverting each source file alone fails its own tests (task-summary: 5, events-ndjson: 1, scrub: 2).
- [x] Add the REQ-agent-232 added delta and the REQ-discord-066 modified delta.
- [x] Typecheck, `bun test`, `specsync check --require-coverage 100`, `specsync change audit` and fledge verify are green.
