---
change: in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone
artifact: requirements
---

# Requirements

- AGENT-1 (captured, `hi/agent.md`): "I can give Corvidinho a task in a
  project folder and it works from that project's own config and tools, not
  from some global sandbox of its own."
- AGENT-1.a (captured on main, Leif 2026-09-28, round 8): "In a project that
  isn't a git repo, my own runs work in the project folder itself (protected
  files and the verify gate still apply); other people's runs only read
  there."
- AGENT-1.b (captured in this PR with `hi`, Leif 2026-09-30, round 13): "In a
  project folder that isn't a git repo, its file tools can't change the root
  AGENTS.md or CLAUDE.md; I edit those myself."
- AGENT-1.c (captured in this PR with `hi`, Leif 2026-09-30, round 13): "My
  schedules for a project that isn't a git repo work in their own separate
  folder, never in the live project folder."
- Defaults applied (`/home/user/coord/m34-defaults.md`, nongit-owner rows;
  not Leif decisions): "isn't a git repo" follows `isGitRepo` (inside a git
  work tree counts as git; the enclosing-repo worktree case is a separate
  SESSION-WORKTREE-4 follow-up); the shell gets no grant there (safe3a-shell
  row). Not built (pending Leif): serializing concurrent owner runs per
  non-git folder.
- Kept: SAFE-2 protected paths, SAFE-3.a, AGENT-14/15 verify gate,
  SESSION-WORKTREE-3/4 (no reuse of a parked dir as cwd; no silent project
  switch), REQ-discord-357 (bind on every turn), IDENTITY-10/11 role rules,
  DISCORD-9 (the owner's images are files it can look at).
- Added: REQ-discord-110 (talk workspace in a non-git project, the park
  invariant, schedules' scoped folder), REQ-plugins-110 (AGENT-1.b),
  REQ-plugins-115 (others only read: work tools need a git work tree),
  REQ-agent-110 (the owner's run in the folder end to end). Modified:
  REQ-discord-013 (images in a `project_dir` talk).
- No new env var, config key, slash command, table, column or schema version.
