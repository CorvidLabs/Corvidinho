---
id: watch-listcomments-fetches-every-comment-inside-the-poll-window-so-an-mention-after-comment-50-on-a-long-issue-or-pr-is
state: draft
type: bug_fix
base_commit: aef2cde685e9e9be6f0dc1c4311a916e33981afc
---

# WATCH listComments fetches every comment inside the poll window so an @mention after comment 50 on a long issue or PR is detected

## Intent

WATCH listComments fetches every comment inside the poll window so an @mention after comment 50 on a long issue or PR is detected

## Affected Canonical Specs

- `watch`

## Acceptance Criteria

- createOctokitSearchClient listComments passes since (the same window fetchWatchEvents uses for search) to issues.listComments and follows pages up to a cap, so on an issue or PR with more than 50 comments an @mention from an allowlisted user posted after comment 50 becomes an issue_comment event; comments updated before the window are not fetched; fixture client and the rest of the event mapping are unchanged

## No-spec Rationale

Not applicable
