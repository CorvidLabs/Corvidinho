---
module: discord
change: restart-recovery-for-work-tasks-issue-87-captured-slice-session-worktree-3-on-bridge-start-work-tasks-left-queued-or
---

# Delta — discord (restart recovery for /work)

## Added

### REQUIREMENT REQ-discord-087

On bridge start with a SQLite-backed WorkStore, work tasks left `queued` or
`running` by a previous process SHALL be marked `failed` with an honest
"abandoned: the bridge restarted while this work was <status>" summary before
any new work is accepted, and each abandoned task's talk session SHALL be
ended (worktree parked, session dropped) so no later talk silently reuses it
as cwd (SESSION-WORKTREE-3). Recovery is idempotent. Resuming work, a durable
queue, priorities and repo locks are out of scope (draft AUTONOMOUS-14).

Acceptance Criteria
- Queued/running tasks from a dead process become failed with an honest summary; completed tasks are untouched.
- A second recovery pass changes nothing.
- Bridge start fails abandoned work and ends its talk session.
