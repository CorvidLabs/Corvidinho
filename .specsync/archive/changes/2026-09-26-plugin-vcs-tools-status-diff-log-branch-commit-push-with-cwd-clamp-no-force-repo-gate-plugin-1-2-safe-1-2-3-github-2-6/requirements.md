---
change: plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6
artifact: requirements
---

# Requirements

Captured HI only: PLUGIN-1 (git available as typed plugin commands), PLUGIN-2
(danger + minTier declared and enforced), SAFE-1 (dangerous denied
non-interactive unless allowlisted), SAFE-2 (protected infra cannot be
deleted through agent tools — applied to staging deletes), SAFE-3 (no
escaping the project root — applied to git cwd / repo discovery), GITHUB-2
(branch + commit + push is the path to a PR from worktree work), GITHUB-6
(repos it will not touch — applied to the push remote).

### REQ-plugins-182

Typed git plugins: reads `git-status` / `git-diff` / `git-log` /
`git-branch-list` (dangerous=false, minTier 0); mutators `git-branch-create` /
`git-commit` / `git-push` (dangerous=true, minTier 2). Argv-only spawns with
`GIT_TERMINAL_PROMPT=0`, cwd clamped to the worktree top level, strict flags,
clamped literal pathspecs. Commit: message required, explicit file paths only,
no amend, protected-delete and secret-path staging refused, `filesChanged`
reported. Push: current branch only, never force, remote OWNER/REPO must pass
`checkRepoGate` (GITHUB-6), credentials from env / credential helper only,
output redacted. Full text and acceptance criteria in `deltas/plugins.md`.

## Not in scope (needs HI capture)

- Draft **SAFE-22** (issue #82, DRAFT pending Leif): explicit policies "never
  commit straight to a default branch" and "never rewrite history that is
  already pushed". This change only avoids exposing force / amend / rebase; it
  does not add a default-branch commit/push refusal.
- Merges (#99) and rebases of shared branches (issue non-goals).
