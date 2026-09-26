---
change: watch-reliability-poll-cycle-logging-error-catch-auto-ack-github-comment-on-start-continue-ignore-own-mentions-document
artifact: testing
---

# Testing

- Unit/fixture: own-sender comments/issues omitted from `fetchWatchEvents`.
- Unit/fixture: ack posts once per event id; skips when sender === watch username;
  skips non-mention types; dry-run/echo does not call live GitHub.
- Poller: cycle result counters logged; injected failing fetch surfaces via catch
  path (or pollOnce rejects observed by wrapper).
- No live GitHub tokens in CI.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-watch-007 | `tests/watch.ack.test.ts` + `tests/watch.poller.test.ts` |

## Automated coverage

- `bun test tests/watch.ack.test.ts tests/watch.poller.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`
