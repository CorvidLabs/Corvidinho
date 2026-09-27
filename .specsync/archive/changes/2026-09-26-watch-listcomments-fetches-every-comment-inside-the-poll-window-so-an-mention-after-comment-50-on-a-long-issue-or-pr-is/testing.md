---
change: watch-listcomments-fetches-every-comment-inside-the-poll-window-so-an-mention-after-comment-50-on-a-long-issue-or-pr-is
artifact: testing
---

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
