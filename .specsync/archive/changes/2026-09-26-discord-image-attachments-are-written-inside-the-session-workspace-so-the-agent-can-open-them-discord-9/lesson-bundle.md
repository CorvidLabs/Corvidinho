# Lesson bundle — discord-image-attachments-are-written-inside-the-session-workspace-so-the-agent-can-open-them-discord-9

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord image attachments are written inside the session workspace so the agent can open them (DISCORD-9)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/image-attachments.ts, src/discord/bridge.ts, tests/discord.image-attachments.test.ts
- **Acceptance**: A Discord image attachment is written under <session cwd>/.corvidinho/attachments/ (not /tmp); the prompt cites that path; files-read with cwd = the session cwd opens it; git status in the talk worktree stays clean; ending the session removes the file with the workspace.

## Evidence

- Verification commit: `be445a51dcf3d12e81b3f8a687aa27d94a73a02a`
- Base commit: `cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f`
- Verified by: `specsync check --spec discord`

## From the change's context.md

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

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
