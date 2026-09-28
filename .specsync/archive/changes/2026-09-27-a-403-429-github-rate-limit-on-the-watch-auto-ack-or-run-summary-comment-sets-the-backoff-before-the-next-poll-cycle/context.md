---
change: a-403-429-github-rate-limit-on-the-watch-auto-ack-or-run-summary-comment-sets-the-backoff-before-the-next-poll-cycle
artifact: context
---

# Context

WATCH-RELIABILITY-3 (captured, `hi/watch.md`): "On GitHub **403 rate-limit**,
back off using `Retry-After` / reset headers (or a documented default) before
the next poll cycle; do not tight-loop; surface a clear log line."
REQ-watch-011 says the same and is not limited to the search fetch.

Gap on main (606b993): the backoff only covered the poll fetch. The poller
also POSTs the auto-ack comment and the run-summary comment through
`createOctokitAckClient`, whose catch returned only `{ ok: false, error }`,
dropping the Octokit status and headers. `maybePostWatchAck` /
`maybePostWatchSummary` never throw, so `applyRateLimitBackoff` was never
called for them: a 403 `retry-after: 90` on the ack left
`getBackoffUntilMs()` at 0, the next poll ran on the normal interval, and the
only log line was `[watch] ack failed …` (or `summary failed …`), never the
rate-limit backoff line. No test covered a rate-limited ack or summary
(`tests/watch.reliability.test.ts` and `tests/watch.auth-stop.test.ts` cover
only a rate-limited fetch).

Constraints: reuse `parseGithubRateLimit` / `formatRateLimitLog` / the 60 s
default; no new env var, config key, CLI or slash command; no SQLite schema
version bump. WATCH-RELIABILITY-1 (summary only after a successful ack, once
per event id, failures not retried) stays as it is. Aborting the rest of the
current cycle is not in the captured text and is not part of this change.
No open issue tracks WATCH-RELIABILITY-3.
