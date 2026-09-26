---
change: discord-image-attachments-are-written-inside-the-session-workspace-so-the-agent-can-open-them-discord-9
artifact: tasks
---

# Tasks

- [x] Regression test through the bridge (fails before: files-read path traversal on `/tmp/corvidinho-images`).
- [x] `attachmentCacheDir` / `WORKSPACE_ATTACHMENTS_SUBDIR`; self-ignoring `.gitignore` in the cache dir.
- [x] Bridge: bind worktree first, then download attachments into the session cwd; identity/memory inject order kept.
- [x] Spec invariant + Public API lines; delta REQ-discord-013 (Modified).
- [x] specsync check, tsc, bun test, `fledge lanes run verify --non-interactive`.
