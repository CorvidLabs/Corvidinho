---
change: a-403-429-github-rate-limit-on-the-watch-auto-ack-or-run-summary-comment-sets-the-backoff-before-the-next-poll-cycle
artifact: tasks
---

# Tasks

- [x] Re-check the gap on current main (rate-limited ack/summary sets no backoff)
- [x] Keep status and rate-limit headers on a failed post in `createOctokitAckClient` (ack.ts)
- [x] Optional `onPostFailed` on `maybePostWatchAck` / `maybePostWatchSummary` (ack.ts, summary.ts)
- [x] Poller routes a failed ack or summary through `applyRateLimitBackoff` (poller.ts)
- [x] Regression tests in `tests/watch.reliability.test.ts` (fail on main, pass on branch)
- [x] docs/WATCH.md, watch.spec.md, requirements.md, testing.md
- [x] REQ-watch-011 delta (Modified)
- [x] specsync check, tsc, bun test, fledge verify
