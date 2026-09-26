---
change: session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks
artifact: context
---

# Context

Leif confirmed SESSION-WORKTREE-1..5 (captured via #60 into `hi/session.md`).
Impl issue #58. Main tip is v0.0.4 (`6cb5f18`) with MEMORY schema v3, `/schedule`,
and SESSION durable store. Discord presence already shows v0.0.4 live.

Problem: Discord/CLI talks and scheduled runs currently spawn the agent with a
shared bridge `projectRoot` cwd — concurrent talks can bleed edits and branch
state into each other.

Cut: steal corvid-agent `server/lib/worktree*` (Linux headless only). Soft session
TTL / new-topic (SESSION-1..3) stay intact; isolation is filesystem/git context,
not MEMORY continuity (SESSION-4 / SESSION-WORKTREE-2). Align schedule
single-project path so ticks on project X use that project's worktree/scope.

Standing constraints:
- Do not invent slash commands beyond HI (optional `project` on existing
  `/session start` and `/work` is OK for SESSION-WORKTREE-4 explicit selection)
- Do not break Discord ingress or schedule ticker
- Do not restart live bridge/watch from this change
- Prefer separate agent worktree under `/workspace` (not Corvidinho-run)
- Eager package bump to **0.0.5** in the same ship
- Made with Corvidinho attribution on PR/issue traffic
