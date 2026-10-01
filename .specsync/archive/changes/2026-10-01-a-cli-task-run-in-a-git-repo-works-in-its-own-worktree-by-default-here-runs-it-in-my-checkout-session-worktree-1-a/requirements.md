---
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
artifact: requirements
---

# Requirements

- SESSION-WORKTREE-1.a (captured, `hi/session.md`, Leif 2026-09-28 round 9):
  "A CLI task run in a git repo works in its own worktree by default; --here
  runs it in my current checkout." Parent SESSION-WORKTREE-1 (a talk that does
  repo work runs in its own worktree so edits and branch state do not bleed).
- Kept: SESSION-WORKTREE-3 (ending a talk parks or cleans its worktree
  safely, never a silent leftover another talk reuses), AGENT-1.a (a non-git
  project runs in the folder itself), AGENT-3 / REQ-cli-244 (signals cancel,
  exit 130), CLI-4 / REQ-cli-419 (one scrubbed error line and a hint), CLI-5
  (`--project`), AGENT-14/15 (the verify gate; a new talk worktree starts
  verified, REQ-agent-015), SAFE-3.a (the local CLI still gets no shell),
  DISCORD-10 (protocol 2 unchanged).
- Added: REQ-cli-122 (where a local task run works, `--here`, cleanup,
  fail-closed, `result.workspace`).
- Modified: REQ-discord-014 / REQ-discord-073, REQ-watch-006 /
  REQ-watch-073, REQ-agent-117, REQ-plugins-117 / REQ-plugins-118 (the
  spawners pass `--here`), REQ-agent-503 (the local-CLI refusal no longer
  says it has no worktree of its own).
- No new env var, config key, slash command, table, schema version or
  protocol version.
