---
change: watch-listcomments-reads-page-1-plus-the-newest-pages-up-to-the-10-page-cap-so-a-flood-of-older-comments-cannot-hide
artifact: tasks
---

# Tasks

- [x] Regression test in `tests/watch.comments-pagination.test.ts`: 1100 in-window comments with the mention at #1100 is detected with exactly 10 requests (pages 1, 3-11); fails on the PR's previous code.
- [x] GitHub-like stub sends `rel="next"` and `rel="last"`; a `withLast: false` mode covers the `rel="next"` fallback and its 10-request cap.
- [x] `listComments` reads page 1, then the newest pages up to the cap via the `rel="last"` page number; falls back to `rel="next"` up to the cap.
- [x] Delta: REQ-watch-234 modified (full text); `specs/watch/requirements.md` and the watch spec change log updated.
