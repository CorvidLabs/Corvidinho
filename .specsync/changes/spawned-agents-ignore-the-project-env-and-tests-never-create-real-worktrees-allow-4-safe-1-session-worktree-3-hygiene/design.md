---
change: spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene
artifact: design
---

# Design

One-line argv change in `src/agent/spawn-argv.ts` (shared by Discord/WATCH
agent clients and the protocol handshake). Non-`.ts` bins are unchanged.
Tests pass `projectRoot` / `defaultProjectRoot` = `mkdtempSync(...)`.
