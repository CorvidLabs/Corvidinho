---
id: watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor
state: approved
type: bug_fix
base_commit: 5366fff96501327ad3bcc30f55105f2c16884b0b
---

# WATCH assignment and review-request events also pass the user allowlist on the user who assigned or requested (the actor), not only the thread author; a missing, non-allowlisted or deny-listed actor is refused quietly with no session, ack or run (ALLOW-1/2/5)

## Intent

WATCH assignment and review-request events also pass the user allowlist on the user who assigned or requested (the actor), not only the thread author; a missing, non-allowlisted or deny-listed actor is refused quietly with no session, ack or run (ALLOW-1/2/5)

## Affected Canonical Specs

- `watch`

## Acceptance Criteria

- An assignment or review_request WATCH event on an allowlisted author's thread starts no session, posts no ack and spawns no run when the user who assigned the watch user or requested its review (the actor) is not on the GitHub user allowlist, is on deny_users, or could not be read; it counts as refused in the cycle log; the same event with an allowlisted, undenied actor still starts a session; the live searcher reads the actor from the issue's events (newest assigned / review_requested event naming the watch user: assigner / review_requester, else the event actor) and leaves it unset on a non-rate-limit failure while a rate limit still backs off; mention and comment events are unchanged; the new poller and router tests fail on main's source and pass on the branch

## No-spec Rationale

Not applicable
