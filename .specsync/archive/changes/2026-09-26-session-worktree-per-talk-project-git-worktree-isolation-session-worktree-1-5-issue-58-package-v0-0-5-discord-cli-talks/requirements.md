---
change: session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks
artifact: requirements
---

# Requirements

1. Shared worktree manager (`src/worktree/`) creates/removes/parks/prunes
   isolated git worktrees (steal corvid-agent; Linux headless)
   (SESSION-WORKTREE-1 / SESSION-WORKTREE-5).
2. Discord talk paths that spawn agent work (`@mention` start, `/session start`,
   `/work`) bind an explicit project (default = bridge `projectRoot`) and run
   the agent with cwd = that talk's worktree or project-scoped dir so edits and
   branch state do not bleed across concurrent talks (SESSION-WORKTREE-1).
3. Soft TTL / new-topic / idle expiry (SESSION-1..3) remain; isolation does not
   replace MEMORY for cross-session continuity (SESSION-WORKTREE-2 / SESSION-4).
4. Ending, abandoning, or TTL-purging a talk parks or removes its worktree so
   another talk never silently reuses it as cwd (SESSION-WORKTREE-3).
5. Project selection is explicit per talk/schedule; once set on a session it
   never silently switches mid-conversation (SESSION-WORKTREE-4). Optional
   `project` on existing `/session start` and `/work` (no new slash commands).
6. Scheduled runs on project X resolve that project and use its worktree/scope
   for the tick spawn (align DISCORD-SCHEDULE single-project path).
7. Persist session `project`, `worktree_path`, `worktree_branch`, `worktree_state`
   (`active`|`parked`|`removed`) on shared SQLite (schema v4) so restart does
   not lose isolation bookkeeping.
8. Package version **0.0.5**; fixture tests; SpecSync + fledge verify green;
   no ProcessManager; secrets out of repo.
