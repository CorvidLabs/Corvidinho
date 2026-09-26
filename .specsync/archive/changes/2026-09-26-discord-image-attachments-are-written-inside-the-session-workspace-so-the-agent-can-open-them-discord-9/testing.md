---
change: discord-image-attachments-are-written-inside-the-session-workspace-so-the-agent-can-open-them-discord-9
artifact: testing
---

# Testing

Regression test: `tests/discord.image-attachments.test.ts`, describe
"bridge writes attachments inside the session workspace (DISCORD-9 /
REQ-discord-013)". It starts the bridge (dry run, injected agent client, mocked
CDN fetch) on a temp git project with `WORKTREE_BASE_DIR` inside the temp
root, sends a mention with one PNG attachment, and takes the image path from
the prompt the agent receives.

- Before the fix: fails. `files-read` with cwd = session worktree returns
  `Path traversal denied: "/tmp/corvidinho-images/imgws…-0.png" resolves
  outside the project directory`.
- After the fix: passes (18 pass, 0 fail in the file).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-013` | `tests/discord.image-attachments.test.ts` | Bridge message with a PNG: the prompt cites `<session cwd>/.corvidinho/attachments/<msgid>-0.png`; `runPlugin files-read` with that cwd returns ok; `git status --porcelain --untracked-files=all` in the talk worktree is empty; after `store.endSession` the file no longer exists. Existing fixture tests (MIME allowlist, caps, localPath, prompt path) still pass. |
