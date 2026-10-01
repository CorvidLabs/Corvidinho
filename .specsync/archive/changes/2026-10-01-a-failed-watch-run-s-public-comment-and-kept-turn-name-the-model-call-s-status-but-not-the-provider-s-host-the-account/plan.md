---
change: a-failed-watch-run-s-public-comment-and-kept-turn-name-the-model-call-s-status-but-not-the-provider-s-host-the-account
artifact: plan
---

# Plan

1. Add `watchPublicFailureLine` to `src/watch/summary.ts`; use it in
   `buildSummaryBody`.
2. Use it for the kept agent turn in `src/watch/poller.ts`; leave the log
   line's full reason.
3. Tests in `tests/watch.failed-comment.test.ts`: the end-to-end comment and
   turn have no host while the log does; `buildSummaryBody` with an Azure
   host; every `modelCallFailedLine` shape and a cut host; untouched lines.
4. Prove the new cases fail on the branch head's sources, then pass.
5. REQ-watch-009 / REQ-watch-472 deltas, `docs/WATCH.md`,
   `specs/watch/{watch.spec,testing}.md`; then the change check, coverage,
   `hi check`, `tsc`, `bun test` and the verify lane.
