---
module: watch
change: watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor
---

# Delta: watch (assignment / review_request gate the user who assigned or requested)

## Added

### REQUIREMENT REQ-watch-302

WATCH `assignment` and `review_request` events SHALL also pass the GitHub user allowlist gate on the user who assigned the watch user or requested its review (`actor`), not only on the thread author (`sender`), before any session spawn (ALLOW-1/2; extends REQ-watch-003). A missing, non-allowlisted or deny-listed actor SHALL be refused quietly with no session, no ack and no run (ALLOW-5).

- `gateEvent` (router) checks the repo, the author and, for these two types, the actor with `isGithubUserAllowed` (deny lists win, even over an allowlisted actor). A missing actor fails (fail closed). `routeEvent` refuses with `actor_not_allowlisted` and the not-authorized reply.
- The poller applies the same gate before the per-issue dedupe, so a refused assignment / review request is counted `refused`, gets no ack and no run, and never shadows a trusted comment on the same issue.
- `issue_comment` / `issues` mention events need no actor and are gated as before. The thread author stays `sender` (session user and prompt author); the actor is never swapped in for it.
- The search client's `findRequestActor` supplies `actor`. The Octokit client reads the issue's events (`issues.listEvents`, page 1 plus the newest pages up to the same 10-page cap as comments) and takes the newest `assigned` event whose `assignee` is the watch user (or `review_requested` event whose `requested_reviewer` is the watch user): its `assigner` (`review_requester`), else the event `actor`.
- No such event, no login, or a non-rate-limit API failure leaves `actor` unset (then refused). A 403/429 rate limit bubbles so the poll backs off (WATCH-RELIABILITY-3).
- The fixture client takes optional `assigners` / `review_requesters` maps keyed `owner/repo#n` (lowercase).
- Event ids (`assign-…`, `reviewreq-…`) are unchanged, so handled ids stored before this change still dedupe (REQ-watch-247). No env var, config key, flag, command or table is added.

Acceptance Criteria
- Router: for each of `assignment` / `review_request` on an allowlisted author's thread, a non-allowlisted actor, no actor, and an actor on `deny_users` (even when allowlisted) → refuse `actor_not_allowlisted`, not-authorized reply, SessionStore unchanged; an allowlisted actor → start_session with the author as session user; an allowlisted actor on a non-allowlisted author's thread → refuse `user_not_allowlisted`.
- Poller (fixture, `ALLOW_USERS=leif`, PR O/R#8 and issue O/R#9 by leif): actor `bob`, no actor, or `bob` allowlisted and on `DENY_USERS` → `started=0 refused=2`, no ack, no run, no session; actor `leif` → both start. A refused newer assignment does not shadow leif's trusted comment on O/R#9.
- Over a stubbed GitHub transport, an issue assigned to the watch user by `bob` (after an older assignment by `leif`) and a PR whose review `bob` requested give events with `sender` `leif` and `actor` `bob`; the newest assignment on the last of three event pages is the one read; a 500 on the events read leaves `actor` unset; a 403 with `x-ratelimit-remaining: 0` rejects with `GithubRateLimitError`.
- These tests fail on main's source.
