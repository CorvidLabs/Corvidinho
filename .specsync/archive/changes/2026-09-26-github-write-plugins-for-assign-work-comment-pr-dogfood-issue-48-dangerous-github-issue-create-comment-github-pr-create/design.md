---
change: github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create
artifact: design
---

# Design

Write path mirrors Discord `discord-post-message`: `dangerous: true`, `minTier: 1`,
`runPlugin` SAFE-1 gate via `CORVIDINHO_ALLOWLIST`, then handler-side GITHUB-6
`checkRepoGate` before Octokit. Optional `CORVIDINHO_GITHUB_DRY_RUN=1` returns
structured dry-run payloads for CI.

`github-pr-create` resolves `--head` from cwd git branch when omitted and appends
`attribution("markdown")` unless the body already contains Made with Corvidinho.

WATCH: search items carry `assignees[]`; when username matches, emit
`assignment` DetectedEvent (`assign-owner/repo#n`) into the existing router
(allowlist unchanged). `involves:` search already surfaces assigned issues.
