---
change: cleanupemptybranch-never-force-deletes-a-branch-with-commits-when-the-default-branch-is-not-main-master
artifact: context
---

# Context

Review blocker on PR #178 (bug `discord-3` follow-up), reproduced by the
reviewer. `removeWorktree(..., { cleanBranch: true })` (used by
`parkWorktree` when a talk or schedule run ends) called `cleanupEmptyBranch`,
which checked `git log main..<branch>` and then `git log master..<branch>`.
In a repo whose default branch is neither (for example `trunk`), both
commands fail with empty stdout, so the code read "no commits" and ran
`git branch -D`, leaving the run's commits unreachable. This is the same
data-loss class PR #178 closed for stale-branch cleanup on create.

Fix, kept small: `cleanupEmptyBranch` now uses the PR's
`branchHasOwnCommits(project, branch)` (`git rev-list --count
HEAD..refs/heads/<branch>` in the project checkout; any git error counts as
"has commits") and deletes only when it returns false. The helper is exported
from `src/worktree/cleanup.ts`; nothing else changes. No new env vars, slash
commands, or schema changes.
