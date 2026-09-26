---
change: github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200
artifact: requirements
---

# Requirements

### REQ-plugins-093

The system SHALL register read-only typed plugins `github-pr-diff` and
`github-pr-files` (GITHUB-3 read half, GITHUB-1) behind the GITHUB-6 repo gate,
with a 200 KiB diff cap + truncation marker, a `--file PATH` filter, paginated
file listing up to a cap, SAFE-6 scrub before the cap, and an untrusted-data
label. Full text in `deltas/plugins.md` (Added).

Acceptance Criteria
- Both commands listed with dangerous=false and minTier=0.
- GITHUB-6 refusal (exit 3) happens before any Octokit call.
- Cap + marker, `--file` section, `--limit` + `truncated`, scrub are fixture-tested with mocked Octokit.

Out of scope: draft GITHUB-10 (confidence score) pending HI capture.
