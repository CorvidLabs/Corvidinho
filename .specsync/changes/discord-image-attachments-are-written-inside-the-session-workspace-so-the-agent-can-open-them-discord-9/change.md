---
id: discord-image-attachments-are-written-inside-the-session-workspace-so-the-agent-can-open-them-discord-9
state: draft
type: bug_fix
base_commit: cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f
---

# Discord image attachments are written inside the session workspace so the agent can open them (DISCORD-9)

## Intent

Discord image attachments are written inside the session workspace so the agent can open them (DISCORD-9)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A Discord image attachment is written under <session cwd>/.corvidinho/attachments/ (not /tmp); the prompt cites that path; files-read with cwd = the session cwd opens it; git status in the talk worktree stays clean; ending the session removes the file with the workspace.

## No-spec Rationale

Not applicable
