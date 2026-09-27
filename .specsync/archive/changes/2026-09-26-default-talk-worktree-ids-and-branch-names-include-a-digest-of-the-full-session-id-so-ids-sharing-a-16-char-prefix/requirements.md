---
change: default-talk-worktree-ids-and-branch-names-include-a-digest-of-the-full-session-id-so-ids-sharing-a-16-char-prefix
artifact: requirements
---

# Requirements

SESSION-WORKTREE-1 (edits and branch state do not bleed across concurrent
talks), SESSION-WORKTREE-3 (park safely; no leftover another talk reuses as
cwd), DISCORD-SCHEDULE-1. Added REQ-discord-241: default talk worktree ids and
branch names carry a digest of the full id, so ids that share a 16-char prefix
never share a worktree dir, scoped dir or `talk/` branch.
