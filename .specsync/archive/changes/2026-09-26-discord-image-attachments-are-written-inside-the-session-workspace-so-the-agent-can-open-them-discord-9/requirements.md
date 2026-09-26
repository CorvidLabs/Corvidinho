---
change: discord-image-attachments-are-written-inside-the-session-workspace-so-the-agent-can-open-them-discord-9
artifact: requirements
---

# Requirements

Captured HI met:

- **DISCORD-9** (hi/discord.md): "Images I attach are available to the agent
  as files it can actually look at." The files were written outside the
  agent's cwd, where its file tool refuses to open them; now they are written
  inside the session workspace.
- Supporting: **SESSION-WORKTREE-3** (end/TTL parks the workspace, which now
  also removes the session's attachments), **SAFE-1** (no dangerous tool is
  needed to open an attachment), **SAFE-6** (no new env or secrets).

Canonical requirement changed (see delta): **REQ-discord-013** (Modified).

No new slash commands, env vars, plugins or config.
