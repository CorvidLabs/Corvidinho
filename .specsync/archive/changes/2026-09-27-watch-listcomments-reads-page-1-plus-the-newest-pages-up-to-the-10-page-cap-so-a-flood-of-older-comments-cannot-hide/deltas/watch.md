---
module: watch
change: watch-listcomments-reads-page-1-plus-the-newest-pages-up-to-the-10-page-cap-so-a-flood-of-older-comments-cannot-hide
---

# Delta — watch (newest comment pages are kept under the page cap)

## Modified

### REQUIREMENT REQ-watch-234

For each search hit, the live WATCH search client SHALL fetch the issue or PR
comments updated inside the same poll window that `fetchWatchEvents` uses
for search, by passing `since` to `issues.listComments` with
`per_page=100`, so an @mention from an allowlisted user is seen even when the
thread has more than 50 comments (REQ-watch-002 / ALLOW-1). Requests per
thread SHALL be capped at 10 pages. Because GitHub lists an issue's comments
oldest-first, when the window holds more pages than the cap the client SHALL
read page 1 plus the newest pages (located via the `Link` `rel="last"` page
number), so a flood of older comments inside the window cannot hide the newest
@mention; without `rel="last"` it MAY follow `rel="next"` up to the cap.
Comments last updated before the window SHALL NOT be fetched.
`SearchClient.listComments` SHALL take the window as an optional `since`; the
fixture client MAY ignore it. Allowlist, dedup, own-username skip and event
shapes are unchanged.

Acceptance Criteria
- On an issue with 60 comments where only #60 is new and mentions the watch username, `fetchWatchEvents` with `createOctokitSearchClient` returns an `issue_comment` event for #60; every comments request carries `since`.
- On a thread with 150 comments inside the window and the mention at #150, the client follows the second page and the mention is detected.
- On a thread with 1100 comments inside the window and the mention at #1100, the mention is detected with exactly 10 comments requests (page 1 and pages 3-11).
- Without `rel="last"`, the client follows `rel="next"` and stops at 10 requests.
- A mention in a comment last updated before the window produces no event.
- No new env vars or commands; fixture tests need no live token.
