---
change: github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create
artifact: context
---

# Context

Issue #48 closes the dogfood gap: tag/assign → work → comment → open PR.
WATCH poll (#19) already does mention/comment/review_request → session stub.
`plugins/github` was read-only (`Write/create omitted`). HI already captures
GITHUB-2 (open PR), GITHUB-3 (comment/review), GITHUB-5 (dangerous create).

This change adds dangerous Octokit write plugins matching Fledge host patterns
(SAFE-1 / CORVIDINHO_ALLOWLIST + GITHUB-6 repo gate), attribution footer on PR
bodies (no @handles), and minimal WATCH **assignment** ingress when the watch
username is in issue/PR assignees. No auto-merge, webhook, or new HI.
