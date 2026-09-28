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
  - **SESSION-3.a**  A reply to it, or a message in its thread, after the session has expired starts a new session that begins from the old one's summary, instead of getting no answer.
- **SESSION-4**  Cross-session continuity comes from MEMORY, not from a long-lived process.
- **SESSION-5**  At about 80% of the model's window, older turns are condensed into a summary; the current task and its latest instructions stay pinned word for word.
- **SESSION-6**  The summary is saved with the session, so after a restart or on a different model it picks up from the summary instead of replaying the whole history.

- **SESSION-WORKTREE-1**  A Discord (or CLI) talk that does repo work runs in its own git worktree (or project-scoped directory) so edits and branch state do not bleed into other concurrent talks.
  - **SESSION-WORKTREE-1.a**  A CLI task run in a git repo works in its own worktree by default; --here runs it in my current checkout.
- **SESSION-WORKTREE-2**  Soft session TTL / new-topic rules (**SESSION-1..3**) still apply; isolation is about filesystem/git context, not replacing MEMORY for cross-session continuity (**SESSION-4**).
- **SESSION-WORKTREE-3**  Ending or abandoning a talk cleans up or parks its worktree safely (no silent leftover that another talk accidentally reuses as cwd).
- **SESSION-WORKTREE-4**  Project selection (“run this on project X”) is explicit per talk/schedule; default project never silently switches mid-conversation.
- **SESSION-WORKTREE-5**  Provenance: steal corvid-agent worktree isolation (`server/lib/worktree*`, Discord `/session` worktree, work-task worktrees, CHANGELOG worktree rows) — Linux headless only; no iced/desktop.

- **SESSION-MULTI-1**  Concurrent users in one channel each have their own session keyed by Discord user id (+ channel); no shared history across people.
- **SESSION-MULTI-2**  Other users can talk while one has an open button ask; both work independently; open buttons stay valid until press or timeout.
- **SESSION-MULTI-3**  The same user can keep chatting while buttons are open; new messages continue their conversation; buttons remain until press or timeout (do not replace pending ask on a new message).
- **SESSION-MULTI-4**  Memory stays scoped to the acting Discord user (IDENTITY-4 / MEMORY ACL).
