---
change: github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create
artifact: requirements
---

# Requirements

### REQ-plugins-048
The system SHALL register dangerous GitHub write plugins: `github-issue-create`,
`github-issue-comment`, `github-pr-create`, `github-pr-review`, each with
`dangerous: true` and `minTier: 1`.

### REQ-plugins-049
In non-interactive mode, write plugins SHALL be denied unless named in
`CORVIDINHO_ALLOWLIST` (SAFE-1 / GITHUB-5). Empty allowlist = refuse.

### REQ-plugins-050
Every write SHALL pass the GITHUB-6 repo gate (ALLOW-1): explicit `--repo` and
non-empty allowlisted org/repo; deny always wins. Exit 3 on refuse.

### REQ-plugins-051
`github-pr-create` SHALL append plain Made with Corvidinho attribution (markdown
link form) to the PR body when missing, and SHALL NOT insert @handles.

### REQ-plugins-052
`CORVIDINHO_GITHUB_DRY_RUN=1` SHALL short-circuit writes without calling Octokit
so CI/fixtures need no live tokens.

### REQ-watch-048
WATCH SHALL emit an `assignment` DetectedEvent when the watch username appears
in issue/PR assignees from search results, feeding the same allowlist → session
path as mentions.

### REQ-plugins-053
STATUS.md and docs/WATCH.md SHALL document write plugins + assignee ingress for
the dogfood path (#48).
