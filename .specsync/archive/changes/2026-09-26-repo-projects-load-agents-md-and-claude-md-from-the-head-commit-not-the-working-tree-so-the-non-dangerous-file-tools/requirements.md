---
change: repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools
artifact: requirements
---

# Requirements

Captured HI met (origin/main `hi/`):

- **AGENT-1** (`hi/agent.md`): the task works from the project's own config;
  the committed AGENTS.md / CLAUDE.md is that config.
- **SAFE-1** (`hi/safe.md`): only a consented dangerous tool (git-commit,
  shell) can change what later runs load; the non-dangerous file tools
  cannot.
- **SAFE-6**: instruction text is still scrubbed before it reaches a
  provider.

Modified: **REQ-agent-084** (see `deltas/agent.md`).

Left for HI capture (not built):

- Extending SAFE-2's protected list with AGENTS.md / CLAUDE.md so the file
  tools refuse to write them (needs Leif's confirmation in `hi/safe.md`).
- Draft AGENT-13 (skills index) and "nearest parent" AGENTS.md from issue
  #84's body.
- ROLES-CHAT-2/3/5 (captured in `hi/roles.md`) are a separate build.
