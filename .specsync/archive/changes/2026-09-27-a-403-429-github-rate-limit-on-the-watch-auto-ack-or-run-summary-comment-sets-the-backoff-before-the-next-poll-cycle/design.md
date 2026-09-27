---
change: a-403-429-github-rate-limit-on-the-watch-auto-ack-or-run-summary-comment-sets-the-backoff-before-the-next-poll-cycle
artifact: design
---

# Design

- `src/watch/ack.ts`: `AckCommentResult` gains optional `status` and
  `headers`. `createOctokitAckClient`'s catch builds the failed result with
  the message, the HTTP status (`status` or `response.status`) and only the
  three rate-limit headers (`retry-after`, `x-ratelimit-remaining`,
  `x-ratelimit-reset`, names lower-cased, values as strings). A success
  result is unchanged. `maybePostWatchAck` takes an optional
  `onPostFailed(res)`, called after the `[watch] ack failed …` line.
- `src/watch/summary.ts`: `maybePostWatchSummary` takes the same optional
  `onPostFailed(res)`, called after the `[watch] summary failed …` line.
  Return values of both helpers are unchanged.
- `src/watch/poller.ts`: each cycle passes `backoffOnCommentFailure` as
  `onPostFailed`. It hands `{ status, message, headers }` to the existing
  `applyRateLimitBackoff` (`parseGithubRateLimit` with the poller clock):
  a 403/429 rate limit moves `backoffUntilMs` forward (never back), logs the
  existing `formatRateLimitLog` line and marks the cycle `rateLimited` with
  `backoffMs`; a plain 403 returns null and changes nothing. The existing
  skip in `runCycle` and the loop's `scheduleNext` delay
  (`max(intervalMs, backoffUntilMs - now)`) then hold the next poll.

Alternatives considered: wrapping the ack client in the poller (rejected: the
backoff line would come before the `ack failed` line); throwing from the ack
client on a rate limit (rejected: changes WATCH-RELIABILITY-1 / REQ-watch-247
failure handling and would skip the agent run); parsing the backoff inside the
ack client with `Date.now()` (rejected: the poller's injectable clock would
not apply to `x-ratelimit-reset`).

Design choices pending Leif:
- The rest of the current cycle is not aborted: after a rate-limited ack the
  agent still runs for that event (its id is already marked processed, so
  skipping would drop a trusted request), and later events in the same cycle
  (at most `maxTriggersPerCycle`) still try their comments. The backoff holds
  the next poll cycle, as the captured text says.
- A failed ack or summary is still marked and not retried after the backoff
  (WATCH-RELIABILITY-1 no-spam rule, unchanged).
- Only the three rate-limit headers are kept on the failed result.
