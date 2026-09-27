---
id: a-talk-stored-with-a-prefix-only-worktree-name-before-the-digest-change-keeps-it-after-upgrade-and-a-new-talk-whose-id
state: approved
type: bug_fix
base_commit: f4a9e48f6faf5d119baf9af265d010d9332df43c
---

# A talk stored with a prefix-only worktree name before the digest change keeps it after upgrade, and a new talk whose id shares that prefix gets its own worktree

## Intent

A talk stored with a prefix-only worktree name before the digest change keeps it after upgrade, and a new talk whose id shares that prefix gets its own worktree

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A session row stored before the digest change (prefix-only worktree path talk-<16-char prefix> and branch talk/<16-char prefix>, state active) re-binds after restart to that stored path and branch; a new session whose id shares that 16-char prefix gets a different worktree dir and talk/ branch, and the stored talk's worktree, branch and uncommitted files survive the new talk's setup; docs/discord.md shows the talk/{sessionPrefix}-{digest} branch shape

## No-spec Rationale

Not applicable
