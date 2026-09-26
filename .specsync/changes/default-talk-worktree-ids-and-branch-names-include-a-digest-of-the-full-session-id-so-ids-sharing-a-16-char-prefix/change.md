---
id: default-talk-worktree-ids-and-branch-names-include-a-digest-of-the-full-session-id-so-ids-sharing-a-16-char-prefix
state: implementing
type: bug_fix
base_commit: faa569f4ac361e7a3eff3ae3a2047227410c803d
---

# Default talk worktree ids and branch names include a digest of the full session id so ids sharing a 16-char prefix never share a worktree

## Intent

Default talk worktree ids and branch names include a digest of the full session id so ids sharing a 16-char prefix never share a worktree

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- talkWorktreeId and generateTalkBranchName return distinct, deterministic names for two ids that share their first 16 characters (e.g. schedule_sched_a1111111_run_aaaa and schedule_sched_a2222222_run_bbbb); ensureTalkWorkspace with such ids and default naming creates two different worktree dirs and talk branches (or two scoped dirs for a non-git project), and creating the second leaves the first's live working tree and uncommitted files in place

## No-spec Rationale

Not applicable
