---
change: watch-listcomments-reads-page-1-plus-the-newest-pages-up-to-the-10-page-cap-so-a-flood-of-older-comments-cannot-hide
artifact: context
---

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
