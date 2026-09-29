---
change: watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor
artifact: design
---

# Design

Keep the author gate and add a gate on the actor (fail closed), reusing the
existing allowlist gate (`isGithubUserAllowed`) rather than a parallel check.

- `src/watch/types.ts`: optional `DetectedEvent.actor`.
- `src/watch/searcher.ts`: `SearchClient.findRequestActor(owner, repo, n,
  "assigned" | "review_requested", username)`. Octokit: `issues.listEvents`
  through `readFirstAndNewestPages` (the comment pager, extracted so both
  lists share it), then the pure `newestRequestActor` (newest matching event;
  `assigner` / `review_requester`, else `actor`). Non-rate-limit error →
  null; rate limit → `GithubRateLimitError` (existing backoff). Fixture:
  `assigners` / `review_requesters` maps. `fetchWatchEvents` asks only
  when it builds an assignment or review-request event and sets `actor` when
  one is found.
- `src/watch/router.ts`: `gateEvent(event, github)` = repo gate, author
  gate, then for `assignment` / `review_request` the actor gate
  (`isGithubUserAllowed(actor ?? "")`, so a missing actor fails and deny
  wins). `routeEvent` refuses with its reason
  (`actor_not_allowlisted`) and the not-authorized reply.
- `src/watch/poller.ts`: `preferAllowlisted` uses `gateEvent`, so a refused
  event is marked denied before dedupe, never acked, never run (the poller
  never posts refuse replies: quiet, ALLOW-5).

Not done (conservative): the actor does not replace the author (that would put
a non-allowlisted author's issue body in the prompt, a separate product
choice); event ids are unchanged (a new id would replay handled
assignments after upgrade); no new env var, config key, flag, command or
table; no schema bump.

Design choices pending Leif:
- Actor source: `assigner` / `review_requester`, falling back to the event
  `actor`; a bot or GitHub Action that assigns / requests needs its own
  login on the user allowlist.
- A refused assignment id stays in the in-memory denied set until restart, so
  a later re-assignment of the same issue by an allowlisted user is not picked
  up until then (same as other refused ids today).
