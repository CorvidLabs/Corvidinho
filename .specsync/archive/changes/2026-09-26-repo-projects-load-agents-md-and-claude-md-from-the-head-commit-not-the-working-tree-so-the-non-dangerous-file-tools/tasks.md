---
change: repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools
artifact: tasks
---

# Tasks

- [x] Shared `decodeInstruction` for cap, UTF-8 cut, binary / UTF-8 refusal
      and SAFE-6 scrub.
- [x] Git projects read AGENTS.md / CLAUDE.md from HEAD (`ls-tree`,
      `cat-file`), no working-tree fallback.
- [x] Committed symlinks followed only inside the commit.
- [x] `uncommitted` flag and `NOT_COMMITTED_REASON`; one-time `Text` note
      covers them.
- [x] Export `NOT_COMMITTED_REASON` from `src/agent/index.ts`.
- [x] Tests: files-write PoC, worktree, unborn HEAD, unusable `.git`,
      committed symlinks, cap, binary, scrub, execute prompt.
- [x] Agent spec prose and REQ-agent-084 delta.
