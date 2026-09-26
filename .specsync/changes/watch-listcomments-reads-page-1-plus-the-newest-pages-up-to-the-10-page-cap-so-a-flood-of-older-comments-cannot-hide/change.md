---
id: watch-listcomments-reads-page-1-plus-the-newest-pages-up-to-the-10-page-cap-so-a-flood-of-older-comments-cannot-hide
state: approved
type: bug_fix
base_commit: 88f75293d5c73d3c7b374f16ffee07e4aeafd5c7
---

# WATCH listComments reads page 1 plus the newest pages up to the 10-page cap so a flood of older comments cannot hide the newest mention

## Intent

WATCH listComments reads page 1 plus the newest pages up to the 10-page cap so a flood of older comments cannot hide the newest mention

## Affected Canonical Specs

- `watch`

## Acceptance Criteria

- On a thread with more than 10 pages (1000+) of comments inside the poll window, createOctokitSearchClient listComments reads page 1 plus the newest pages up to the 10-page cap (via the Link rel=last page number), so an @mention posted after a flood of older in-window comments still becomes an issue_comment event; requests per thread stay capped at 10; without rel=last it follows rel=next up to the cap; since, per_page=100, the fixture client and event shapes are unchanged

## No-spec Rationale

Not applicable
