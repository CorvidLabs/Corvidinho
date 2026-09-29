---
change: watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor
artifact: context
---

# Context

W12 bug sweep (Leif's 2026-09-28 interview, Wave 0, no new criteria), record
`watch-assign-reviewreq-actor-ungated` in `/home/user/coord/w12.json`.

On `origin/main` (5366fff) `fetchWatchEvents` builds the `assign-<repo>#<n>`
and `reviewreq-<repo>#<n>` events with `sender: item.user`, the issue / PR
author from search. Nothing reads who assigned the watch user or requested its
review: `listReviewRequests` returns reviewer logins only and search returns
the author and assignees. Both user gates (`preferAllowlisted` in
`src/watch/poller.ts`, `routeEvent` in `src/watch/router.ts`) check
`sender` only. So a collaborator who is not allowlisted, with triage or write
access, can request corvid-agent's review on (or assign it to) an allowlisted
author's thread and start a WATCH session and agent run. Impact is bounded:
these event types get no ack or summary comment, and WATCH runs are non-ADMIN
read/chat sessions. It still breaks ALLOW-1 ("does not reply to or act on
GitHub ... review requests from people ... not on an allowlist I control") and
ALLOW-2 ("a request must match what I allowed before it may respond or start
autonomous work").

Repro on main: fixture poller with `ALLOW_REPOS=O/R`, `ALLOW_USERS=leif`,
PR O/R#8 by leif with corvid-agent requested and issue O/R#9 by leif assigned
to corvid-agent → `fetched=2 new=2 started=2 refused=0`, whoever did the
requesting.

Interview design calls for this slice: per the record; deny lists win; an
untrusted actor gets no run and no ack (silent per WATCH rules); tests fail on
main. Kind bug-fix. #232 / #233 scope is not touched.
