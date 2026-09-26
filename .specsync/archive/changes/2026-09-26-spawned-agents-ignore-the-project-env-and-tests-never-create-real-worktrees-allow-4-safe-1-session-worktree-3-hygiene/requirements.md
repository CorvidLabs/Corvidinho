---
change: spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene
artifact: requirements
---

# Requirements

1. `buildCorvidinhoArgv` SHALL invoke `.ts` bins as `bun --no-env-file <bin>`.
2. A `.env` in the spawn cwd SHALL NOT reach the spawned process.
3. Bridge + slash fixture tests SHALL use temp project roots; `bun test`
   creates no worktrees/branches in the repo.
