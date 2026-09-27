# Lesson bundle — watch-listcomments-reads-page-1-plus-the-newest-pages-up-to-the-10-page-cap-so-a-flood-of-older-comments-cannot-hide

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH listComments reads page 1 plus the newest pages up to the 10-page cap so a flood of older comments cannot hide the newest mention
- **Kind**: BugFix
- **Specs**: watch
- **Paths**: src/watch/searcher.ts, tests/watch.comments-pagination.test.ts
- **Acceptance**: On a thread with more than 10 pages (1000+) of comments inside the poll window, createOctokitSearchClient listComments reads page 1 plus the newest pages up to the 10-page cap (via the Link rel=last page number), so an @mention posted after a flood of older in-window comments still becomes an issue_comment event; requests per thread stay capped at 10; without rel=last it follows rel=next up to the cap; since, per_page=100, the fixture client and event shapes are unchanged

## Evidence

- Verification commit: `7a966cde36233876092c442786526694c90ecf27`
- Base commit: `88f75293d5c73d3c7b374f16ffee07e4aeafd5c7`
- Verified by: `specsync check --spec watch`

## From the change's context.md

# Context

Adversarial review of PR #196 (bug report watch-github-4). The PR fixed
`createOctokitSearchClient().listComments` reading only the first 50 (oldest)
comments by passing `since` (the poll window) and following `rel="next"` with
`octokit.paginate.iterator`, capped at 10 pages of 100.

GitHub lists an issue's comments oldest-first and the per-issue endpoint cannot
sort descending, so the cap cut from the wrong end: once a thread holds more
than 1000 comments inside the 2-day window, the newest ones (the only ones not
already seen by earlier polls) were dropped. That is the same bug at a higher
threshold, and anyone who can comment on a public thread can reach it by
flooding it: an allowlisted `@corvid-agent` mention posted after the flood was
not fetched until the flood aged out of the window. Reproduced with a stubbed
GitHub transport (1100 in-window comments, mention at #1100: not detected,
10 requests).

Constraints: minimal bug fix inside `src/watch/searcher.ts`; keep the 10-request
bound, `since`, `per_page=100`, the fixture client and event shapes as they are;
no new env vars, commands or config. Comment bodies stay untrusted data; this
change only changes which pages are fetched.

## From the change's testing.md

# Testing

`tests/watch.comments-pagination.test.ts` runs the real
`createOctokitSearchClient` + `fetchWatchEvents` against a stubbed
`globalThis.fetch` that behaves like GitHub: comments in ascending id order,
`per_page` / `page` / `since` honored, and every page but the last carries
`Link` `rel="next"` and `rel="last"` (the `withLast: false` mode drops
`rel="last"`).

- On `origin/main` source: 0 pass / 5 fail.
- On the PR's previous `listComments` (paginate.iterator, cap from the oldest end): 4 pass / 1 fail (the flood test: mention at #1100 not detected after 10 requests).
- With this change: 5 pass / 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-234` | `tests/watch.comments-pagination.test.ts` › a flood of older comments past the page cap cannot hide the newest @mention | 1100 comments inside the window, mention at #1100 (id 2099). `comment-2099` is detected; comments requests are exactly pages `[1, 3, 4, 5, 6, 7, 8, 9, 10, 11]` (10 requests). Fails on the PR's previous code and on main. |
| `REQ-watch-234` | `tests/watch.comments-pagination.test.ts` › without rel=last the client follows rel=next, still capped at 10 pages | Next-only links: 150 comments → mention at #150 detected in 2 requests; 1500 comments → exactly 10 requests. |
| `REQ-watch-234` | `tests/watch.comments-pagination.test.ts` › newest @mention after comment #50 on an old tracker is detected; busy thread with more than one page inside the window is paginated; comments older than the window are not fetched | Unchanged behaviour: `since` on every comments request, 2 requests for 150 comments, no event for stale pings. |
| `REQ-watch-002`, `REQ-watch-007` | `tests/watch.poller.test.ts`, `tests/watch.ack.test.ts`, `tests/watch.reliability.test.ts` | Fixture client path unchanged; watch tests stay green. |

## Where these lessons go

- `specs/watch/context.md`
