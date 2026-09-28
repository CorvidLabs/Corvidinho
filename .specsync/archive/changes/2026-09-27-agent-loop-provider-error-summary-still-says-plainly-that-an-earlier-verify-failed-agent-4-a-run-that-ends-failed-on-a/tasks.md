---
change: agent-loop-provider-error-summary-still-says-plainly-that-an-earlier-verify-failed-agent-4-a-run-that-ends-failed-on-a
artifact: tasks
---

# Tasks

- [x] `runTask` keeps the last failed verify output and appends it to the summary when `exec.error` ends the run.
- [x] Regression test in `tests/agent.loop.test.ts` (fails before, passes after); first-attempt error test asserts no verification note.
- [x] End-to-end `createTaskExecute` repro in `tests/agent.tool-loop.test.ts` asserts the verify output is in the summary.
- [x] Delta modifies REQ-agent-242; Error Cases row updated.
