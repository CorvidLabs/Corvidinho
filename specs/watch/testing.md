---
module: watch
---

# Testing

- `tests/watch.router.test.ts` — allow/deny/continue; `deny_users` and `deny_orgs` win over allow lists that name the user / repo, no session; assignment / review_request also gate the actor (`actor_not_allowlisted`) (REQ-watch-302)
- `tests/watch.config.test.ts` — fail-start + expand repos
- `tests/watch.poller.test.ts` — fixture searcher + poll cycles + dedup; assignment / review_request by a non-allowlisted, missing or deny-listed actor on an allowlisted author's thread → refused, no session / ack / run, and never shadows a trusted comment (REQ-watch-302)
- `tests/watch.request-actor.test.ts` — actor of the newest matching `assigned` / `review_requested` issue event over a stubbed transport (last page read, 500 → none, rate limit bubbles) and `newestRequestActor` (REQ-watch-302)
- `tests/watch.cli.test.ts` — missing token clean exit; help lists watch
- `tests/watch.session-store.durable.test.ts` — schema v6, durable reload, soft TTL keep-alive/expiry, one session per issue, SAFE-6 topic scrub, poller restart continuity, stop halts mid-cycle, single-flight cycles, per-event failure isolation, second-watcher row replacement (REQ-watch-037)
- `tests/watch.dedup-durable.test.ts` — handled ids survive a poller restart (no second run/ack/summary), a 2000-id stranger flood cannot evict a handled trusted id, a failed id write leaves the event for the next cycle (even when a retry would succeed), a failed acked/summarized write after the comment still runs the agent once, durable per-kind id stores (REQ-watch-247)

## Rate limit on the ack or summary comment (REQ-watch-011 modified, WATCH-RELIABILITY-3)

- `tests/watch.reliability.test.ts` › "WATCH-RELIABILITY-3 rate limit on the
  auto-ack or run-summary comment" — the real Octokit ack client over a
  stubbed GitHub transport (no network, no live token): a failed post keeps
  its status and only the rate-limit headers, and a successful post returns the
  same result as before; a 403 `retry-after: 90` on the ack sets a 90 s
  backoff (backoff line after `ack failed`), the agent still runs once with no
  summary, a pollOnce inside the backoff skips the fetch and the failed ack is
  not retried after it; with the poll loop on, a 403 `retry-after: 600` on
  the ack keeps the loop from polling again until the 600 s have passed (not
  after one normal interval);
  `x-ratelimit-remaining: 0` + `x-ratelimit-reset` on
  the summary backs off until the reset (reason `x-ratelimit-reset`); a
  rate-limit message with no headers uses the 60 s default; a plain 403 on the
  ack or the summary sets no backoff.

## Run-summary comment keeps the closing role note (REQ-watch-734, ROLES-CHAT-3)

- `tests/watch.summary-scrub.test.ts` › "a long summary is clipped before its
  note, after the scrub; one without a note is clipped as before": the
  1529-char `chatBodyFromTaskResult` of a summary ending with the note gives a
  1200-char preview ending with the note right before the `---` footer; a
  GitHub token straddling where the note makes room leaves no `ghp_` prefix
  and the note is kept; a 1500-char summary without the note is clipped to its
  first 1200 chars as before. With `origin/main`'s `src/watch/summary.ts` the
  test fails; the file's other tests pass either way.

