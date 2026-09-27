---
change: a-talk-stored-with-a-prefix-only-worktree-name-before-the-digest-change-keeps-it-after-upgrade-and-a-new-talk-whose-id
artifact: requirements
---

# Requirements

SESSION-WORKTREE-1 (edits and branch state do not bleed across concurrent
talks), SESSION-WORKTREE-3 (no leftover another talk reuses as cwd) and
DISCORD-SCHEDULE-1, via REQ-discord-241. Modified REQ-discord-241 adds one
acceptance criterion for the upgrade path: a talk stored with a prefix-only
name before the digest change keeps its stored worktree and branch on
re-bind, and a new talk whose id shares that prefix gets a different worktree
and branch and leaves the stored talk's files in place. The requirement text
itself is unchanged.
