---
module: watch
change: a-403-429-github-rate-limit-on-the-watch-auto-ack-or-run-summary-comment-sets-the-backoff-before-the-next-poll-cycle
---

# Delta — watch (rate limit on the auto-ack or run-summary comment backs off, WATCH-RELIABILITY-3)

## Modified

### REQUIREMENT REQ-watch-011

The system SHALL back off on GitHub 403 rate-limit (or 429) using Retry-After or x-ratelimit-reset headers, else a documented default of 60s, before the next poll cycle; SHALL NOT tight-loop; SHALL emit a clear watch github rate-limit backoff log line (WATCH-RELIABILITY-3).
The backoff SHALL cover every GitHub call the poller makes: the poll fetch, the auto-ack comment and the run-summary comment. A failed comment post SHALL keep its HTTP status and rate-limit headers (`retry-after`, `x-ratelimit-remaining`, `x-ratelimit-reset`) so the same backoff applies. No env var, config key, CLI or slash command is added.

Acceptance Criteria
- Retry-After seconds preferred; else reset; else 60s default.
- While backoff outstanding, pollOnce skips fetch.
- Plain 403 without rate-limit signal does not trigger backoff.
- A 403/429 rate limit on the auto-ack or run-summary comment sets the same backoff (Retry-After, else x-ratelimit-reset, else 60s): the `[watch] github rate-limit backoff` line follows the `ack failed` / `summary failed` line, and a pollOnce inside the backoff skips the fetch.
- A plain 403 on the auto-ack or run-summary comment logs only `ack failed` / `summary failed` and sets no backoff.
- WATCH-RELIABILITY-1 unchanged: a rate-limited ack gets no summary, a failed ack or summary is not retried, and the agent run still happens once.
