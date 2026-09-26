---
change: spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene
artifact: research
---

# Research

Bun loads `.env`, `.env.local`, `.env.<NODE_ENV>` from cwd for unset vars;
explicitly set vars (even empty) are not overridden; `--no-env-file` disables
it (verified with bun 1.4.2).
