# Lesson bundle — schedule-runs-name-worktrees-and-branches-from-the-full-schedule-and-run-ids-and-stale-branch-cleanup-parks-a-branch

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Schedule runs name worktrees and branches from the full schedule and run ids, and stale-branch cleanup parks a branch with commits instead of deleting it (SESSION-WORKTREE-1/3, DISCORD-SCHEDULE-3)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/scheduler/service.ts, src/worktree/cleanup.ts, tests/scheduler.worktree.test.ts, specs/discord/discord.spec.md
- **Acceptance**: every schedule run gets its own worktree dir and talk/ branch named from the full schedule and run ids, so a later run never deletes an earlier run's commits and two concurrent schedules never share a worktree; stale-branch cleanup renames a branch with commits not on HEAD to BRANCH-parked-TIMESTAMP instead of force-deleting it

## Evidence

- Verification commit: `e75b7fd104992669be564b55ba41b9b9af3a6d3e`
- Base commit: `cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f`
- Verified by: `specsync check --spec discord`

## From the change's context.md

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

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
