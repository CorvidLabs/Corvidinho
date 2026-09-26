---
hi: 1
families: [SESSION]
owner: leif
---

# Session

## Intent

Sessions stay short-lived by default. Soft TTL keeps an active conversation; idle or a new topic starts fresh. Cross-session continuity comes from MEMORY, not a long-lived process.

## Criteria

- **SESSION-1**  Prefer fresh sessions over reusing stale ones by default.
- **SESSION-2**  Soft TTL of about 30–60 minutes: continued activity keeps the same session.
- **SESSION-3**  Idle expiry or a clear new topic starts a new session.
- **SESSION-4**  Cross-session continuity comes from MEMORY, not from a long-lived process.

- **SESSION-WORKTREE-1**  A Discord (or CLI) talk that does repo work runs in its own git worktree (or project-scoped directory) so edits and branch state do not bleed into other concurrent talks.
- **SESSION-WORKTREE-2**  Soft session TTL / new-topic rules (**SESSION-1..3**) still apply; isolation is about filesystem/git context, not replacing MEMORY for cross-session continuity (**SESSION-4**).
- **SESSION-WORKTREE-3**  Ending or abandoning a talk cleans up or parks its worktree safely (no silent leftover that another talk accidentally reuses as cwd).
- **SESSION-WORKTREE-4**  Project selection (“run this on project X”) is explicit per talk/schedule; default project never silently switches mid-conversation.
- **SESSION-WORKTREE-5**  Provenance: steal corvid-agent worktree isolation (`server/lib/worktree*`, Discord `/session` worktree, work-task worktrees, CHANGELOG worktree rows) — Linux headless only; no iced/desktop.
