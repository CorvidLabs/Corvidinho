# Lesson bundle — cleanupemptybranch-never-force-deletes-a-branch-with-commits-when-the-default-branch-is-not-main-master

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: CleanupEmptyBranch never force-deletes a branch with commits when the default branch is not main/master
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/worktree/manager.ts, src/worktree/cleanup.ts, tests/worktree.test.ts
- **Acceptance**: removing or parking a talk worktree with branch cleanup deletes the branch only when it has no commits off the project HEAD, and any git error keeps the branch; in a repo whose default branch is trunk (no main or master) a branch with a commit survives remove and park, and a branch with no commits of its own is still deleted

## Evidence

- Verification commit: `241aa7414d5b3967fed109bd4e1de547367149ec`
- Base commit: `0f81c13648593457803513b59068008ddd07d6db`
- Verified by: `specsync check --spec discord`

## From the change's context.md

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

## From the change's testing.md

# Testing

`tests/worktree.test.ts` builds a real temp git repo whose default branch is
`trunk` (no `main` or `master`), with `WORKTREE_BASE_DIR` under the temp
root. Before the fix the new test fails (the parked `talk/worked` branch is
gone: expected its commit sha, received empty); after the fix it passes, and
the rest of `bun test` stays green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-203` | `tests/worktree.test.ts` › default branch 'trunk': branch with commits survives cleanup, clean branch is deleted | `talk/worked` commits `work.txt` in its worktree and is parked with `parkWorktree`; the worktree dir is gone and `refs/heads/talk/worked` still points at the run's commit. |
| `REQ-discord-203` | `tests/worktree.test.ts` › default branch 'trunk': branch with commits survives cleanup, clean branch is deleted | `talk/clean` has no commits off HEAD; `removeWorktree(..., { cleanBranch: true })` deletes it, and `talk/worked` is still at its commit afterwards. |

## Where these lessons go

- `specs/discord/context.md`
