---
change: watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging
artifact: plan
---

# Plan

1. Capture HI → `hi/watch.md`; clear draft status.
2. Add `rate-limit.ts`, `spawn-log.ts`, `summary.ts`; wire into `poller.ts` + `searcher.ts`.
3. Extend docs/WATCH.md, STATUS, CHANGELOG; bump package 0.0.10.
4. Fixture tests for backoff, once-per-event summary, spawn logging.
5. SpecSync delta REQ-watch-009..011; approve → check → review → ship; PR as corvid-agent.
