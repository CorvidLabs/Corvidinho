---
change: schedule-runs-name-worktrees-and-branches-from-the-full-schedule-and-run-ids-and-stale-branch-cleanup-parks-a-branch
artifact: tasks
---

# Tasks

- [x] Regression tests fail on the old code (run N commits lost; shared worktree; stale branch force-deleted).
- [x] Scheduler names each run's worktree/branch from the full schedule + run ids.
- [x] Stale-branch cleanup parks (renames) a branch with commits off HEAD instead of `branch -D`.
- [x] Add `REQ-discord-203` delta and list the new test in the discord spec files.
- [x] Typecheck, `bun test`, `specsync check`, fledge verify green.
