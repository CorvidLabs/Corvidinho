---
change: watch-listcomments-fetches-every-comment-inside-the-poll-window-so-an-mention-after-comment-50-on-a-long-issue-or-pr-is
artifact: context
---

# Context

Bug report watch-github-4 (medium). `createOctokitSearchClient().listComments`
called `octokit.rest.issues.listComments({ owner, repo, issue_number, per_page: 50 })`
with no `page`, no `since` and no pagination. GitHub returns issue comments
oldest-first (ascending id) and the endpoint cannot sort descending, so on any
issue or PR with more than 50 comments (a long-running tracker, a busy PR) the
poller only ever saw the same oldest 50. A new `@corvid-agent please fix X`
from an allowlisted user after comment 50 was never fetched: no event, no
session, no ack, and nothing in the logs. This breaks REQ-watch-002 / ALLOW-1
ingress (mentions from allowlisted users must be seen).

docs/WATCH.md only documented the search-page bury risk, not this one.

Constraints: minimal bug fix; no new env vars or commands; the fixture search
client and the rest of the event mapping stay as they are. Comment bodies are
untrusted data; this change only changes which comments are fetched.
