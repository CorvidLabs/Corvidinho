---
change: watch-listcomments-fetches-every-comment-inside-the-poll-window-so-an-mention-after-comment-50-on-a-long-issue-or-pr-is
artifact: tasks
---

# Tasks

- [x] Regression test `tests/watch.comments-pagination.test.ts` that fails before the fix (stubbed GitHub transport: ascending comments, per_page/page/since honored, Link rel=next).
- [x] `SearchClient.listComments` takes an optional `since`; `fetchWatchEvents` passes its poll window.
- [x] Octokit client passes `since`, uses `per_page=100` and follows pages with `octokit.paginate.iterator` up to `MAX_COMMENT_PAGES` (10).
- [x] Delta REQ-watch-234 and requirement evidence.
