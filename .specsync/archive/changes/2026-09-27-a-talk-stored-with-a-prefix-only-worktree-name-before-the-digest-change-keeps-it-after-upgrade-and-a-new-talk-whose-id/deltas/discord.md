---
module: discord
change: a-talk-stored-with-a-prefix-only-worktree-name-before-the-digest-change-keeps-it-after-upgrade-and-a-new-talk-whose-id
---

# Delta — discord (pre-digest stored talk names survive a new talk sharing their prefix)

## Modified

### REQUIREMENT REQ-discord-241

The default worktree id and `talk/` branch name that `ensureTalkWorkspace`
derives from a session or run id (`talkWorktreeId` /
`generateTalkBranchName`) SHALL be deterministic for that id and SHALL
include a collision-resistant digest of the full id, not only a shortened
prefix, so two ids that share a prefix never get the same worktree dir,
scoped dir or branch, and creating one talk's workspace never removes another
talk's live working tree (SESSION-WORKTREE-1 / SESSION-WORKTREE-3 /
DISCORD-SCHEDULE-1). Explicit `worktreeId` / `branchName` overrides and
names already stored on a session SHALL be used as given. No new env var,
slash command or schema change.

Acceptance Criteria
- Two ids that share their first 16 characters (e.g. `schedule_sched_a1111111_run_aaaa` and `schedule_sched_a2222222_run_bbbb`) get different default worktree ids and branch names; the same id always gets the same names.
- `ensureTalkWorkspace` with default naming for two such ids creates two different worktrees and branches; the first's uncommitted files survive the second's setup.
- In a non-git project the two ids get different scoped dirs and the first's files survive.
- A talk stored before the digest change with a prefix-only worktree path and `talk/` branch keeps that path and branch when it re-binds after a restart, and a new talk whose id shares that prefix gets a different worktree and branch and leaves the stored talk's worktree, branch and uncommitted files in place.
