---
change: a-403-429-github-rate-limit-on-the-watch-auto-ack-or-run-summary-comment-sets-the-backoff-before-the-next-poll-cycle
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "Octokit ack client keeps the status and rate-limit headers of a failed post" | Real Octokit ack client over a stubbed transport: a 403 with `retry-after: 90`, `x-ratelimit-remaining` and an unrelated header returns `ok: false`, `status: 403` and only the two rate-limit headers, which `parseGithubRateLimit` reads as 90 s `retry-after-seconds`; a 201 returns `{ ok, id, url }` as before. Fails on main (no status/headers). |
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "403 Retry-After on the auto-ack: backoff set, next pollOnce skips the fetch, no tight loop" | `getBackoffUntilMs()` = now + 90 s, cycle `rateLimited` / `backoffMs` 90000, the exact `[watch] github rate-limit backoff ms=90000 until=… reason=retry-after-seconds` line after `ack failed`; agent ran once, one POST, `summary skip no-successful-ack`; a pollOnce 30 s later logs `poll skip rate-limit backoff remaining_ms=60000` with no fetch or POST; after the backoff the poll runs, `new=0`, the ack is not retried. Fails on main (backoff 0). |
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "x-ratelimit-remaining 0 + reset on the run summary: backoff until the reset" | Ack posted, summary 403 with `x-ratelimit-remaining: 0` / reset now+120 s: backoff line `ms=120000 … reason=x-ratelimit-reset` after `summary failed`, summarized id marked, next pollOnce skipped. Fails on main. |
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "rate-limit message with no headers on the ack uses the documented 60s default" | 403 "API rate limit exceeded" with no headers: backoff 60000 ms, `reason=default`. Fails on main. |
| `REQ-watch-011` | `tests/watch.reliability.test.ts` › "a plain 403 on the ack or the summary logs the failure only and sets no backoff" | 403 "Resource not accessible by integration" on the ack, then on the summary: `ack failed` / `summary failed` only, no backoff line, `getBackoffUntilMs()` 0, the next poll fetches. Guard (passes on main and branch). |
| `REQ-watch-009` / `REQ-watch-011` | `tests/watch.reliability.test.ts`, `tests/watch.auth-stop.test.ts`, `tests/watch.dedup-durable.test.ts` | Existing fetch backoff, summary-once, 401 stop and failed-id-write tests pass unchanged. |

## Fail-on-main proof

Swapping main's `src/watch/ack.ts`, `src/watch/summary.ts` and
`src/watch/poller.ts` in: the 4 new rate-limit tests fail (14 others in the
file pass, including the plain-403 guard); restored branch source: 18/18 pass.

## Automated coverage

- `bun test tests/watch.reliability.test.ts`
- `bun test`
- `bunx tsc --noEmit`
