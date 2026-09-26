---
change: discord-image-attachments-are-written-inside-the-session-workspace-so-the-agent-can-open-them-discord-9
artifact: context
---

# Context

Bug discord-5 (medium): DISCORD-9 was broken live. The bridge called
`enrichPromptWithImages` without a `cacheDir`, so attachments went to the
`IMAGE_CACHE_DIR` default `/tmp/corvidinho-images`. The prompt told the agent
to "Open the local path(s) above", but the agent runs with its cwd set to the
session worktree, and `files-read` (the only non-dangerous reader) refuses any
path outside its cwd (`resolveProjectPath`, `plugins/files/resolvePath.ts`):
`Path traversal denied: "/tmp/corvidinho-images/<msgid>-0.png" resolves
outside the project directory`. `shell-exec` is denied in non-interactive
mode, so the agent could not reach the image at all. The files also piled up
in `/tmp` and were never cleaned up.

Fix: the bridge now binds the session worktree first and then downloads
attachments into `<session cwd>/.corvidinho/attachments/`
(`attachmentCacheDir(store.cwdFor(session))`). The dir gets a self-ignoring
`.gitignore` (`*`), so images never reach a commit in any target repo without
editing its own `.gitignore`. Parking the workspace on session end or TTL
expiry (`git worktree remove --force`, or `rmSync` for scoped dirs) already
deletes the whole workspace, so the images go with it. Identity and memory
injection still run after the image step, in the same order as before; only
the point in time moved (after the thinking status starts and the bind, inside
the existing `try` so an unexpected throw still marks the status failed).

Ruled out: a new read-only image tool (new plugin surface, more than the fix
needs); an env var for the cache dir (not needed; the workspace is known).
The `/tmp` default stays as a fallback for callers that pass no cache dir;
the bridge no longer uses it.
