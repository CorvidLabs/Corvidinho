---
module: watch
change: watch-listcomments-fetches-every-comment-inside-the-poll-window-so-an-mention-after-comment-50-on-a-long-issue-or-pr-is
---

# Delta — watch (comments inside the poll window are all fetched)

## Added

### REQUIREMENT REQ-watch-234

For each search hit, the live WATCH search client SHALL fetch the issue or PR
comments updated inside the same poll window that `fetchWatchEvents` uses
for search, by passing `since` to `issues.listComments` with
`per_page=100` and following further pages up to a cap of 10 pages, so an
@mention from an allowlisted user is seen even when the thread has more than
50 comments (REQ-watch-002 / ALLOW-1). Comments last updated before the
window SHALL NOT be fetched. `SearchClient.listComments` SHALL take the
window as an optional `since`; the fixture client MAY ignore it. Allowlist,
dedup, own-username skip and event shapes are unchanged.

Acceptance Criteria
- On an issue with 60 comments where only #60 is new and mentions the watch username, `fetchWatchEvents` with `createOctokitSearchClient` returns an `issue_comment` event for #60; every comments request carries `since`.
- On a thread with 150 comments inside the window and the mention at #150, the client follows the second page and the mention is detected.
- A mention in a comment last updated before the window produces no event.
- No new env vars or commands; fixture tests need no live token.
