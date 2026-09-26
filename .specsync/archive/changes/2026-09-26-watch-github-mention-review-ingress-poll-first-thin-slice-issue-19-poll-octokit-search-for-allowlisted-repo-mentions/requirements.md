---
change: watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions
artifact: requirements
---

# Requirements

### REQ-watch-001
The system SHALL document the deploy choice: **poll-first for bot/VM** (no public
URL required); webhook when a public URL + webhook secret are available. Thin
slice SHALL ship poll; webhook MAY be a follow-up issue.

### REQ-watch-002
The poller SHALL turn allowlisted GitHub mention / issue_comment / review_request
events into session stubs (start or continue by `owner/repo#number`). It SHALL
use typed Octokit (or an injectable search client) — not shell `gh`.

### REQ-watch-003
Before any session spawn, every event SHALL pass GitHub repo allowlist and
GitHub user allowlist gates (ALLOW-1/2). Empty allowlists mean deny-all. Denied
contacts SHALL be refused quietly with no session (ALLOW-5).

### REQ-watch-004
The poller SHALL fail to start when `GITHUB_TOKEN`/`GH_TOKEN` is missing, when
the mention username is missing, or when the GitHub repo allowlist (orgs+repos)
is empty. Secrets SHALL stay out of the repo.

### REQ-watch-005
Processed event ids SHALL be deduplicated so the same comment/review does not
spawn duplicate sessions. No ProcessManager; no auto-merge/auto-update in this
slice. Fixture tests SHALL not require live webhook secrets.

### REQ-cli-watch-001
The CLI SHALL expose `corvidinho github watch` to start the poll loop, with a
go-live checklist on clean failure. Help/doctor SHALL mention WATCH env +
allowlist requirements without printing secrets.
