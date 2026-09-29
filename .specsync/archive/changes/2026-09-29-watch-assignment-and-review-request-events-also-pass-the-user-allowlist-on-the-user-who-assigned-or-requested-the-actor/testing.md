---
change: watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor
artifact: testing
---

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
