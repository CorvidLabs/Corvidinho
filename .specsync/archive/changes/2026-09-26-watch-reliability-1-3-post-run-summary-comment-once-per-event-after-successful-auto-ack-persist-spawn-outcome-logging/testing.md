---
change: watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging
artifact: testing
---

# Testing

- Unit: `computeRateLimitBackoffMs` / `parseGithubRateLimit` header preference + default 60s.
- Unit: `maybePostWatchSummary` requires successful ack; once per event id.
- Unit: `SpawnOutcomeStore` JSONL append; `classifySpawnError`.
- Poller integration: rate-limit fetch → backoff log + skip re-poll; ack+summary on spawn; spawn outcome records.
- No live GitHub tokens in CI.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-watch-009 | `tests/watch.reliability.test.ts` (summary once-per-event + poller ack/summary) |
| REQ-watch-010 | `tests/watch.reliability.test.ts` (spawn outcome log + JSONL) |
| REQ-watch-011 | `tests/watch.reliability.test.ts` (backoff parse + poller skip) |

## Automated coverage

- `bun test tests/watch.reliability.test.ts tests/watch.ack.test.ts tests/watch.poller.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`
