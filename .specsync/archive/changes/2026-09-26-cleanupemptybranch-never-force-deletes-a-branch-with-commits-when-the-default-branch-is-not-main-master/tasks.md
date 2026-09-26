---
change: cleanupemptybranch-never-force-deletes-a-branch-with-commits-when-the-default-branch-is-not-main-master
artifact: tasks
---

# Tasks

- [x] Regression test fails on the old code (`trunk` repo: parked branch with a commit is force-deleted).
- [x] `cleanupEmptyBranch` deletes only when `branchHasOwnCommits` returns false (HEAD-based; git error keeps the branch).
- [x] Export `branchHasOwnCommits` from `src/worktree/cleanup.ts` and reuse it in `src/worktree/manager.ts`.
- [x] Add the `REQ-discord-203` modified delta with the remove/park acceptance bullet.
- [x] Typecheck, `bun test`, `specsync check`, fledge verify green.
