---
change: watch-listcomments-reads-page-1-plus-the-newest-pages-up-to-the-10-page-cap-so-a-flood-of-older-comments-cannot-hide
artifact: testing
---

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
