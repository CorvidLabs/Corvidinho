---
change: schedule-runs-name-worktrees-and-branches-from-the-full-schedule-and-run-ids-and-stale-branch-cleanup-parks-a-branch
artifact: context
---

# Context

Bug `discord-3` (high). `SchedulerService.runOne` passed
`schedule_${schedule.id}_${run.id}` as the session id to `ensureTalkWorkspace`,
whose default `talkWorktreeId` / `generateTalkBranchName` keep only the first
16 characters. Every id starts `schedule_sched_`, so the name kept one random
hex char: every run of a schedule used one dir (`talk-schedule_sched_a`) and
one branch (`talk/schedule_sched_a`), and 1 in 16 schedule pairs collided.

Two failures followed, both reproduced with a real git repo:

- Run N committed and was parked (park keeps a branch with commits). Run N+1's
  `createWorktree` called `cleanStaleWorktreeState`, which ran `git branch -D`
  on that branch unconditionally, destroying run N's commits.
- Two due schedules sharing a first id char ran together (maxConcurrent=2);
  the second run's setup `git worktree remove --force`d the first run's live
  worktree, uncommitted edits included, while its agent was still running.

Fix, kept small: the scheduler passes `worktreeId` / `branchName` built from the
full (sanitised) schedule + run ids, keeping the `talk-` / `talk/` prefix; and
`cleanStaleWorktreeState` deletes a stale branch only when it has no commits
off the project HEAD, otherwise it renames it to `<branch>-parked-<ms>`. If
the rename fails the branch stays and worktree creation refuses, so work is
never force-deleted. Talk (session) naming is unchanged.
