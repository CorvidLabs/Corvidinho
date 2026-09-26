---
change: schedule-runs-name-worktrees-and-branches-from-the-full-schedule-and-run-ids-and-stale-branch-cleanup-parks-a-branch
artifact: testing
---

# Testing

`tests/scheduler.worktree.test.ts` uses real temp git repos with
`WORKTREE_BASE_DIR` under the temp root; every `talk/*` branch and worktree it
makes is removed with the temp dir. Before the fix all 3 tests fail (run 1's
commit gone, B's cwd equals A's `talk-schedule_sched_<c>` dir, the stale
branch's commit gone); after the fix all 3 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-203` | `tests/scheduler.worktree.test.ts` › each run gets its own branch; a parked run's commits survive the next run | Run 1 commits `run1 work` in its worktree and is parked; after run 2 the commit is still in `git log --all`, and the two runs used different branches and dirs. |
| `REQ-discord-203` | `tests/scheduler.worktree.test.ts` › concurrent schedules with a shared id prefix never share a worktree | Two schedules whose ids share the first hex char run together; B gets a different dir and A's uncommitted `wip.txt` is still there while A's agent runs. |
| `REQ-discord-203` | `tests/scheduler.worktree.test.ts` › stale branch with commits ahead of HEAD is parked, not deleted | Re-creating `talk/keepme` keeps its commit on `talk/keepme-parked-*`; a stale branch with no commits of its own is still deleted with no parked copy. |
