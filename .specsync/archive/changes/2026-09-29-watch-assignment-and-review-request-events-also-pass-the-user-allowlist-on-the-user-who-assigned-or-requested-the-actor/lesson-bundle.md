# Lesson bundle — watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH assignment and review-request events also pass the user allowlist on the user who assigned or requested (the actor), not only the thread author; a missing, non-allowlisted or deny-listed actor is refused quietly with no session, ack or run (ALLOW-1/2/5)
- **Kind**: BugFix
- **Specs**: watch
- **Paths**: src/watch/types.ts, src/watch/searcher.ts, src/watch/router.ts, src/watch/poller.ts, src/watch/index.ts, tests/watch.poller.test.ts, tests/watch.router.test.ts, tests/watch.request-actor.test.ts, tests/fixtures/watch/mentions.json, docs/WATCH.md, specs/watch/watch.spec.md, specs/watch/testing.md
- **Acceptance**: An assignment or review_request WATCH event on an allowlisted author's thread starts no session, posts no ack and spawns no run when the user who assigned the watch user or requested its review (the actor) is not on the GitHub user allowlist, is on deny_users, or could not be read; it counts as refused in the cycle log; the same event with an allowlisted, undenied actor still starts a session; the live searcher reads the actor from the issue's events (newest assigned / review_requested event naming the watch user: assigner / review_requester, else the event actor) and leaves it unset on a non-rate-limit failure while a rate limit still backs off; mention and comment events are unchanged; the new poller and router tests fail on main's source and pass on the branch

## Evidence

- Verification commit: `3661ed23756da6d110c0f4f6fbe9c475f3d2c969`
- Base commit: `5366fff96501327ad3bcc30f55105f2c16884b0b`
- Verified by: `specsync check --spec watch`

## From the change's context.md

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

## From the change's design.md

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

## From the change's testing.md

# Testing

New tests:

- `tests/watch.router.test.ts` › "assignment / review_request actor gate"
  (11 tests): for each type, a non-allowlisted actor, no actor and a
  deny-listed (but allowlisted) actor on an allowlisted author's thread →
  refuse `actor_not_allowlisted` with NOT_AUTHORIZED and no session; an
  allowlisted actor starts a session whose user stays the author; an
  allowlisted actor on a non-allowlisted author's thread is still refused
  (`user_not_allowlisted`); mentions / comments need no actor.
- `tests/watch.poller.test.ts` › "assignment / review_request gate the user
  who assigned or requested" (5 tests), the w12 repro: PR O/R#8 and issue
  O/R#9 by allowlisted `leif`, `ALLOW_USERS=leif`. Actor `bob` →
  `fetched=2 started=0 refused=2`, no run, no ack, no session; no actor →
  same; `ALLOW_USERS=leif,bob` + `DENY_USERS=bob` → same (deny wins); actor
  `leif` → both start, no ack (these types never ack); a refused newer
  assignment does not shadow leif's trusted `@corvid-agent` comment on O/R#9
  (the comment starts, prompt `[WATCH issue_comment] O/R#9 by @leif`). The
  fixture-searcher test also checks `actor` from the fixture maps.
- `tests/watch.request-actor.test.ts` (new, 7 tests): pure
  `newestRequestActor` (newest match, other assignees / kinds ignored,
  `assigner` / `review_requester` first else `actor`, no match / no login /
  team request → null) and `createOctokitSearchClient` over a stubbed
  `fetch`: actor `bob` with sender `leif` for both types; newest assignment
  on page 3 of 3 read (pages 1, 2, 3); 500 → no actor; 403
  `x-ratelimit-remaining: 0` → `GithubRateLimitError`.

Fail-on-main proof: `src/watch/{types,searcher,router,poller,index}.ts`
replaced by `origin/main` (5366fff), the three files run, then the branch
source restored (35 pass, 0 fail after restore):

| Source | Result | Failing |
|---|---|---|
| main | 17 pass, 12 fail | router: 6 (non-allowlisted / no actor / denied actor × 2 types); poller: 5 (fixture `actor`, untrusted actor started 2, missing actor, deny wins, shadowed comment); request-actor: file fails to load (`newestRequestActor` missing) |
| branch | 35 pass, 0 fail | — |

Mutation: `preferAllowlisted` gating a copy of the event typed `issues`
(actor gate off in the poller only, still on in `routeEvent`) → 9 pass, 1
fail (the shadowed-comment test: the refused assignment wins the dedupe and
the trusted comment is lost). Restored.

No live GitHub token or network: Octokit's `fetch` is stubbed per test and
restored.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-302` | `tests/watch.router.test.ts`, `tests/watch.poller.test.ts`, `tests/watch.request-actor.test.ts` | Assignment / review_request with a non-allowlisted, missing or deny-listed actor → refuse `actor_not_allowlisted`, NOT_AUTHORIZED, no session; in a poll cycle `started=0 refused=2`, no ack, no run. Allowlisted actor → start, session user = author. Author gate still applies. A refused assignment never shadows a trusted comment. Octokit client reads `assigner` / `review_requester` of the newest matching event (last page), sender stays the author; 500 → no actor; rate limit → `GithubRateLimitError`; fixture maps → `actor`, comments carry none. Fails on main's source. |
| `REQ-watch-003` (unchanged) | `tests/watch.router.test.ts` | Repo / author gates and deny tests unchanged and still pass; REQ-watch-302 extends "every event SHALL pass repo + user allowlist gates" to the actor. |
| `REQ-watch-048` (unchanged) | `tests/watch.poller.test.ts` | Fixture assignee still yields `assign-CorvidLabs/Corvidinho#48` (type assignment). |
| `REQ-watch-234` (unchanged) | `tests/watch.comments-pagination.test.ts` | The comment pager moved into `readFirstAndNewestPages`; pages requested are unchanged (`[1, 3..11]`, next-only cap 10). |

## Where these lessons go

- `specs/watch/context.md`
