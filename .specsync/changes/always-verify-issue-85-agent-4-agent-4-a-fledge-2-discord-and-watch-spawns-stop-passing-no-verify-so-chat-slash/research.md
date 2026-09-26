---
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
artifact: research
---

# Research

- Callers: every Discord entry (`bridge.ts` mention, `command-handlers/session.ts`,
  `command-handlers/work.ts`, `scheduler/service.ts`) and WATCH
  (`watch/poller.ts`) spawn through the two `createSpawnAgentClient`s, so the
  argv fix lives in two lines.
- Gate trigger on main: `runTask` verified only when `exec.filesChanged` was
  non-empty. `files-write` / `files-edit` / `files-delete` report
  `filesChanged`; `shell-exec` (#83) does not.
- Failure bodies on main dropped `result.summary` and printed only
  `failed (exit N)`, so a lane failure read the same as a crash.
- Merlin m#1163 / m#1176 (issue "steal from"): the verify gate was blind to
  subagent edits; react to workspace deltas, not the edit log. Snapshot HEAD +
  porcelain at start, diff at the end. Porcelain alone misses a second edit to
  an already-dirty file, so the snapshot adds a content fingerprint per listed
  path.
- `git status` refreshes the index and can take `index.lock`;
  `GIT_OPTIONAL_LOCKS=0` avoids racing the agent's own git work. Inside a git
  hook `GIT_DIR` / `GIT_INDEX_FILE` are set and would redirect the probe; the
  runner strips them.
- Store DB (`~/.local/share/corvidinho`), image cache (`/tmp/corvidinho-images`)
  and talk worktrees (`.corvid-worktrees`, sibling of the project) live outside
  the project tree, so memory writes or attachments do not count as changes.
