---
id: work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only
state: draft
type: feature
base_commit: 19683b6059902c62baeddb9d2110f64f82dc3009
---

# /work opens a draft PR from its verified worktree (issue 88, AUTONOMOUS-3, GITHUB-2, GITHUB-5, AGENT-4): after a /work run, only when git-commit, git-push and github-pr-create are allowlisted for non-interactive use, commit and push the talk branch and open a draft PR through the existing git and github plugins with a description built from the real diff and the verify result; otherwise reply plainly why no PR was opened

## Intent

/work opens a draft PR from its verified worktree (issue 88, AUTONOMOUS-3, GITHUB-2, GITHUB-5, AGENT-4): after a /work run, only when git-commit, git-push and github-pr-create are allowlisted for non-interactive use, commit and push the talk branch and open a draft PR through the existing git and github plugins with a description built from the real diff and the verify result; otherwise reply plainly why no PR was opened

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- After a /work run in a git worktree with changes, when git-commit, git-push and github-pr-create are allowlisted (GITHUB-5) and the tree passed the verify lane, the talk branch is committed, pushed and opened as a draft PR via the github plugin whose body lists the real changed files, diffstat, commits and verify result; a failed run, failed verify, no changes, missing allow or repo gate refusal opens no PR and the /work reply says why in one plain line; fixture tests mock the plugins and verify lane

## No-spec Rationale

Not applicable
