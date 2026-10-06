---
change: in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone
artifact: research
---

# Research

- Sources: issue #84 (AGENT-1; closed HI-complete for the loader, #150),
  Leif's interview record `/home/user/coord/interview-2026-09-28.md` (round 8
  AGENT-1 design call; round 13 "Non-git AGENTS.md" and "Owner schedules in
  non-git projects"), the slice record `/home/user/coord/pr-nongit-owner.json`
  and the nongit-owner rows of `/home/user/coord/m34-defaults.md`.
- Workspace callers: `SessionStore.bindWorktree` (every Discord talk path:
  chat, ask pick / Answer resume, `/session start`, `/work`, the SESSION-3.a
  resume), `SchedulerService.runOne` (schedules) and
  `enterCliTaskWorkspace` (CLI; already keeps a non-git cwd in place).
- Session rows store only path, branch and state; the bridge inferred the kind
  from the branch (no branch ⇒ scoped dir) for park and bind, so a row whose
  path is the project folder needs its kind derived by realpath, not stored.
- Role gate: `roleAllowsPlugin(role, cmd, workTask)` gives team its work
  tools only when `actingWorkTask()` reads the `/work` stamp; it is called
  from `runPlugin`, `refusedForRole` (an invented call) and
  `buildOpenAiTools` (the catalog) — all three know the run's cwd.
- SAFE-3.a: `shellToolsGate` grants only at the top of the session's own
  linked talk worktree (`isOwnTalkWorktree`), so a project folder is already
  refused; the verify gate in a non-git cwd already runs on reported edits
  and the test-name walk (REQ-agent-002 / 185).
- Project instructions: `loadProjectInstructions` reads the working-tree
  copy when no `.git` is at or above the cwd; the file tools resolve paths
  to where a write lands (`resolveProjectPath`, through symlinks).
- Images: the bridge wrote attachments under `<cwd>/.corvidinho/attachments/`,
  removed with the scoped dir or worktree at the end of the talk.
