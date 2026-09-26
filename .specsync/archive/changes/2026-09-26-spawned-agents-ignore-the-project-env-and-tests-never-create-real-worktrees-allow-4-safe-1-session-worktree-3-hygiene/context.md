---
change: spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene
artifact: context
---

# Context

Found while reviewing PR #128: spawns run with cwd = the talk's project
worktree (#70), and Bun auto-loads `.env*` from the cwd into any variable the
parent left unset. Verified: a repo `.env` with `CORVIDINHO_ALLOWLIST=memory-forget`
reached the child. That lets a worked-on repo inject allowlists (SAFE-1 / ALLOW),
admin lists or keys into the agent — config must come from the bot VM (ALLOW-4).

Separately, an end-to-end probe found `bun test` created real `talk/sess_*`
worktrees + branches next to the repo: bridge and slash fixtures used
`process.cwd()` (the repo) as the project root.
