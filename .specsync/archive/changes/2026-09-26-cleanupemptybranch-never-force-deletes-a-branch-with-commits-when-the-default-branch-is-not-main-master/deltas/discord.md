---
module: discord
change: cleanupemptybranch-never-force-deletes-a-branch-with-commits-when-the-default-branch-is-not-main-master
---

# Delta — discord (worktree branch cleanup never force-deletes work on a non-main default branch)

## Modified

### REQUIREMENT REQ-discord-203

Each `/schedule` run SHALL get its own git worktree directory and `talk/`
branch named from the full schedule id and run id, never a shortened prefix,
so one run never reuses or removes the worktree or branch of another run of
the same schedule, or of another schedule running at the same time
(SESSION-WORKTREE-1 / SESSION-WORKTREE-3 / DISCORD-SCHEDULE-3). When creating a
worktree finds a stale branch of the same name, it SHALL delete that branch
only when it has no commits off the project HEAD; a branch with its own
commits SHALL be renamed aside to `<branch>-parked-<ms>` and SHALL NOT be
force-deleted. Removing or parking a worktree with branch cleanup SHALL
likewise delete its branch only when the branch has no commits off the project
HEAD, whatever the default branch is called; any git error SHALL count as
having commits and keep the branch.

Acceptance Criteria
- Two runs of one schedule use different worktree dirs and branches; a parked run's commits survive the next run.
- Two schedules whose ids share a prefix, running at once, get different worktrees; neither run's setup removes the other's live working tree.
- A stale branch with commits off HEAD is kept under `<branch>-parked-<ms>`; a stale branch with no commits of its own is deleted as before.
- In a repo whose default branch is `trunk` (no `main`/`master`), removing or parking a worktree keeps a branch with a commit of its own and still deletes a branch with none.
