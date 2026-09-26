---
change: plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6
artifact: context
---

# Context

Issue #82 (P1, M3 "Real dev teammate", build step 4 of tracker #123): going
from issue to PR needs typed git tools instead of improvised shell. HI
already captures PLUGIN-1 (git is one of the plugin families), PLUGIN-2,
SAFE-1/2/3 and GITHUB-2/6. The issue's only new criterion, SAFE-22 ("never
force-push, rewrite pushed history, or commit straight to a default branch"),
is DRAFT pending Leif — it is not acceptance criteria here. We only avoid
exposing force / amend / rebase; the explicit default-branch policy waits for
HI capture.

Builds on #81 (files/search plugins): reuse `resolveProjectPath` (cwd clamp +
symlink escape refuse) and `isProtectedPath` (SAFE-2). Reuse
`checkRepoGate` (GITHUB-6) from the GitHub plugins for the push remote.
`runPlugin` already audits dangerous runs (SAFE-5) and fails closed.
