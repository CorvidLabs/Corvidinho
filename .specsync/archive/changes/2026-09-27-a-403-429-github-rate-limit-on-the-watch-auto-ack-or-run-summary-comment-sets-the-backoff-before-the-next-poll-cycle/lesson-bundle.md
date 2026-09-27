# Lesson bundle — a-403-429-github-rate-limit-on-the-watch-auto-ack-or-run-summary-comment-sets-the-backoff-before-the-next-poll-cycle

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A 403/429 GitHub rate limit on the WATCH auto-ack or run-summary comment sets the backoff before the next poll cycle (WATCH-RELIABILITY-3)
- **Kind**: BugFix
- **Specs**: watch
- **Paths**: src/watch/ack.ts, src/watch/summary.ts, src/watch/poller.ts, tests/watch.reliability.test.ts, docs/WATCH.md
- **Acceptance**: When the WATCH auto-ack or run-summary comment POST fails with a GitHub 403 rate limit (or 429), createOctokitAckClient keeps the HTTP status and the rate-limit headers (retry-after, x-ratelimit-remaining, x-ratelimit-reset) on the failed result, and the poller sets the rate-limit backoff from them: Retry-After seconds, else x-ratelimit-reset, else the documented 60s default; it logs the existing [watch] github rate-limit backoff ms=... until=... reason=... line after the ack failed / summary failed line, a pollOnce before the backoff ends skips the fetch with [watch] poll skip rate-limit backoff remaining_ms=..., and the loop waits out the backoff before its next poll (no tight loop, WATCH-RELIABILITY-3); a plain 403 with no rate-limit signal on either comment still logs only ack failed / summary failed and sets no backoff; WATCH-RELIABILITY-1 is unchanged (summary only after a successful ack, at most once per event id, a failed ack or summary is not retried, the agent run still happens once); a successful post returns the same result as before; no new env var, config key, CLI or slash command and no SQLite schema version bump; regression tests with a stubbed GitHub transport fail on main and pass on the branch

## Evidence

- Verification commit: `ab23a4358e9f9c4e04e3c454c4834f579b971cb9`
- Base commit: `606b993d7175c2f32759e3f02865492e5e884389`
- Verified by: `specsync check --spec watch`

## From the change's context.md

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

## From the change's design.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "Octokit ack client keeps the status and rate-limit headers of a failed post" | Real Octokit ack client over a stubbed transport: a 403 with `retry-after: 90`, `x-ratelimit-remaining` and an unrelated header returns `ok: false`, `status: 403` and only the two rate-limit headers, which `parseGithubRateLimit` reads as 90 s `retry-after-seconds`; a 201 returns `{ ok, id, url }` as before. Fails on main (no status/headers). |
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "403 Retry-After on the auto-ack: backoff set, next pollOnce skips the fetch, no tight loop" | `getBackoffUntilMs()` = now + 90 s, cycle `rateLimited` / `backoffMs` 90000, the exact `[watch] github rate-limit backoff ms=90000 until=… reason=retry-after-seconds` line after `ack failed`; agent ran once, one POST, `summary skip no-successful-ack`; a pollOnce 30 s later logs `poll skip rate-limit backoff remaining_ms=60000` with no fetch or POST; after the backoff the poll runs, `new=0`, the ack is not retried. Fails on main (backoff 0). |
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "the poll loop waits out a comment rate-limit backoff before its next poll" | Poll loop on (fake timers): the first tick's auto-ack gets 403 `retry-after: 600`; two normal intervals later the loop has not polled again (one fetch); once the 600 s backoff has passed the loop polls once more, the ack is not retried and the agent ran once. Fails on main (the loop polls again after one interval). |
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "x-ratelimit-remaining 0 + reset on the run summary: backoff until the reset" | Ack posted, summary 403 with `x-ratelimit-remaining: 0` / reset now+120 s: backoff line `ms=120000 … reason=x-ratelimit-reset` after `summary failed`, summarized id marked, next pollOnce skipped. Fails on main. |
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "rate-limit message with no headers on the ack uses the documented 60s default" | 403 "API rate limit exceeded" with no headers: backoff 60000 ms, `reason=default`. Fails on main. |
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "a plain 403 on the ack or the summary logs the failure only and sets no backoff" | 403 "Resource not accessible by integration" on the ack, then on the summary: `ack failed` / `summary failed` only, no backoff line, `getBackoffUntilMs()` 0, the next poll fetches. Guard (passes on main and branch). |
| `REQ-watch-009` / `REQ-watch-011` | `tests/watch.reliability.test.ts`, `tests/watch.auth-stop.test.ts`, `tests/watch.dedup-durable.test.ts` | Existing fetch backoff, summary-once, 401 stop and failed-id-write tests pass unchanged. |

## Fail-on-main proof

Swapping main's `src/watch/ack.ts`, `src/watch/summary.ts` and
`src/watch/poller.ts` in: the 5 new rate-limit tests fail (14 others in the
file pass, including the plain-403 guard); restored branch source: 19/19 pass.

## Automated coverage

- `bun test tests/watch.reliability.test.ts`
- `bun test`
- `bunx tsc --noEmit`

## Where these lessons go

- `specs/watch/context.md`
