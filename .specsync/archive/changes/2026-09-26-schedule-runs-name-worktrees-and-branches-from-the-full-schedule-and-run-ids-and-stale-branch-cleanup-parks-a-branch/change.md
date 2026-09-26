---
id: schedule-runs-name-worktrees-and-branches-from-the-full-schedule-and-run-ids-and-stale-branch-cleanup-parks-a-branch
state: archived
type: bug_fix
base_commit: cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f
---

# Schedule runs name worktrees and branches from the full schedule and run ids, and stale-branch cleanup parks a branch with commits instead of deleting it (SESSION-WORKTREE-1/3, DISCORD-SCHEDULE-3)

## Intent

Schedule runs name worktrees and branches from the full schedule and run ids, and stale-branch cleanup parks a branch with commits instead of deleting it (SESSION-WORKTREE-1/3, DISCORD-SCHEDULE-3)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- every schedule run gets its own worktree dir and talk/ branch named from the full schedule and run ids, so a later run never deletes an earlier run's commits and two concurrent schedules never share a worktree; stale-branch cleanup renames a branch with commits not on HEAD to BRANCH-parked-TIMESTAMP instead of force-deleting it

## No-spec Rationale

Not applicable
