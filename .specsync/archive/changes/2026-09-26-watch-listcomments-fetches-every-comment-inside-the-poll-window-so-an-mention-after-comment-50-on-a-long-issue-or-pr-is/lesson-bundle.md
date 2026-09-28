# Lesson bundle — watch-listcomments-fetches-every-comment-inside-the-poll-window-so-an-mention-after-comment-50-on-a-long-issue-or-pr-is

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH listComments fetches every comment inside the poll window so an @mention after comment 50 on a long issue or PR is detected
- **Kind**: BugFix
- **Specs**: watch
- **Paths**: src/watch/searcher.ts, tests/watch.comments-pagination.test.ts
- **Acceptance**: createOctokitSearchClient listComments passes since (the same window fetchWatchEvents uses for search) to issues.listComments and follows pages up to a cap, so on an issue or PR with more than 50 comments an @mention from an allowlisted user posted after comment 50 becomes an issue_comment event; comments updated before the window are not fetched; fixture client and the rest of the event mapping are unchanged

## Evidence

- Verification commit: `dbba041736a4751e10fdae69b7e41696e6e86ee7`
- Base commit: `aef2cde685e9e9be6f0dc1c4311a916e33981afc`
- Verified by: `specsync check --spec watch`

## From the change's context.md

# Context

Bug report watch-github-4 (medium). `createOctokitSearchClient().listComments`
called `octokit.rest.issues.listComments({ owner, repo, issue_number, per_page: 50 })`
with no `page`, no `since` and no pagination. GitHub returns issue comments
oldest-first (ascending id) and the endpoint cannot sort descending, so on any
issue or PR with more than 50 comments (a long-running tracker, a busy PR) the
poller only ever saw the same oldest 50. A new `@corvid-agent please fix X`
from an allowlisted user after comment 50 was never fetched: no event, no
session, no ack, and nothing in the logs. This breaks REQ-watch-002 / ALLOW-1
ingress (mentions from allowlisted users must be seen).

docs/WATCH.md only documented the search-page bury risk, not this one.

Constraints: minimal bug fix; no new env vars or commands; the fixture search
client and the rest of the event mapping stay as they are. Comment bodies are
untrusted data; this change only changes which comments are fetched.

## From the change's testing.md

# Testing

`tests/watch.comments-pagination.test.ts` runs the real
`createOctokitSearchClient` + `fetchWatchEvents` against a stubbed
`globalThis.fetch` that behaves like GitHub: search returns issue
`corvidlabs/app#7`; the comments endpoint returns comments in ascending id
order, honors `per_page` (default 30), `page` and `since` (on
`updated_at`), and sends `Link: rel="next"` while pages remain.

Before the fix: 0 pass / 3 fail (the client asked
`/repos/corvidlabs/app/issues/7/comments?per_page=50` once; comment #60 was
never fetched, and stale pings from before the window became events).
After the fix: 3 pass / 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-234` | `tests/watch.comments-pagination.test.ts` › newest @mention after comment #50 on an old tracker is detected | 60 comments, #1-59 older than the window, #60 (id 1059) is `@corvid-agent please fix the flaky test` from an allowlisted user. `comment-1059` is an `issue_comment` event; every comments request carries `since=<window start>`. Fails on main (`undefined`). |
| `REQ-watch-234` | `tests/watch.comments-pagination.test.ts` › busy thread with more than one page inside the window is paginated | 150 comments all inside the window, mention at #150 (id 1149). `comment-1149` is detected after exactly 2 comments requests (100 + 50). Fails on main (events `[]`). |
| `REQ-watch-234` | `tests/watch.comments-pagination.test.ts` › comments older than the window are not fetched | 3 comments all older than the window, two of them mention `@corvid-agent`. No `issue_comment` event. Fails on main (both stale pings became events). |
| `REQ-watch-002`, `REQ-watch-007` | `tests/watch.poller.test.ts`, `tests/watch.ack.test.ts`, `tests/watch.reliability.test.ts` | Fixture client path unchanged (it ignores `since`); all watch tests stay green (60 pass across 8 files with the new one). |

## Where these lessons go

- `specs/watch/context.md`
