---
id: a-403-429-github-rate-limit-on-the-watch-auto-ack-or-run-summary-comment-sets-the-backoff-before-the-next-poll-cycle
state: implementing
type: bug_fix
base_commit: 606b993d7175c2f32759e3f02865492e5e884389
---

# A 403/429 GitHub rate limit on the WATCH auto-ack or run-summary comment sets the backoff before the next poll cycle (WATCH-RELIABILITY-3)

## Intent

A 403/429 GitHub rate limit on the WATCH auto-ack or run-summary comment sets the backoff before the next poll cycle (WATCH-RELIABILITY-3)

## Affected Canonical Specs

- `watch`

## Acceptance Criteria

- When the WATCH auto-ack or run-summary comment POST fails with a GitHub 403 rate limit (or 429), createOctokitAckClient keeps the HTTP status and the rate-limit headers (retry-after, x-ratelimit-remaining, x-ratelimit-reset) on the failed result, and the poller sets the rate-limit backoff from them: Retry-After seconds, else x-ratelimit-reset, else the documented 60s default; it logs the existing [watch] github rate-limit backoff ms=... until=... reason=... line after the ack failed / summary failed line, a pollOnce before the backoff ends skips the fetch with [watch] poll skip rate-limit backoff remaining_ms=..., and the loop waits out the backoff before its next poll (no tight loop, WATCH-RELIABILITY-3); a plain 403 with no rate-limit signal on either comment still logs only ack failed / summary failed and sets no backoff; WATCH-RELIABILITY-1 is unchanged (summary only after a successful ack, at most once per event id, a failed ack or summary is not retried, the agent run still happens once); a successful post returns the same result as before; no new env var, config key, CLI or slash command and no SQLite schema version bump; regression tests with a stubbed GitHub transport fail on main and pass on the branch

## No-spec Rationale

Not applicable
