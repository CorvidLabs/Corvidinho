---
module: plugins
change: github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200
---

# Delta — plugins (PR review reads, GITHUB-3 / #93)

## Added

### REQUIREMENT REQ-plugins-093

The system SHALL register read-only typed plugins `github-pr-diff` and
`github-pr-files` (GITHUB-3 read half, GITHUB-1) that call GitHub through
Octokit, never shell `gh`. Both SHALL declare `dangerous: false` and
`minTier: 0` and SHALL apply the same `--repo OWNER/REPO` GITHUB-6 repo gate as
the other github-* commands before any API call (default-deny, deny wins,
exit 3).

`github-pr-diff <number> --repo OWNER/REPO [--file PATH]` SHALL return the PR's
unified diff, capped at 200 KiB of UTF-8 cut on a line boundary, with a clear
`[corvidinho: diff truncated …]` marker when capped. `--file PATH` SHALL return
only that file's diff section (matching the new or previous path) and SHALL
fail with a clear error when the file is not in the PR.

`github-pr-files <number> --repo OWNER/REPO [--limit N]` SHALL list changed
files with status, additions and deletions (and the previous name for
renames), paginated up to `--limit` (default 300, max 3000) with a `truncated`
flag when more files exist.

Returned diff text and file names SHALL be passed through `scrubSecrets`
(SAFE-6) before capping, and payloads SHALL label the content as untrusted PR
data, not instructions.

Acceptance Criteria
- `plugins list` shows `github-pr-diff` and `github-pr-files` with dangerous=false and minTier=0.
- Empty or deny-listed repo refuses with exit 3 before any Octokit call.
- A diff over 200 KiB returns at most 200 KiB plus the truncation marker; `--file` returns one file's section.
- `github-pr-files` pages `pulls.listFiles`, honours `--limit`, and sets `truncated`.
- Vendor-token-looking strings in diff text are redacted, including one straddling the cap.
- Tests mock Octokit (no network, no token).
