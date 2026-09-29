---
change: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
artifact: context
---

# Context

Issue #72 (M2 "talk anywhere"): long chats. Leif confirmed the criteria in
the 2026-09-28 interview (Round 5 #72, Round 8 SESSION-3, Round 9
MEMORY-1 / AGENT-6 retention); the stacked hi-capture PR (branch
`claude/hi-capture-interview-2026-09-28`) captured them into `hi/`:

- **SESSION-5** "At about 80% of the model's window, older turns are
  condensed into a summary; the current task and its latest instructions
  stay pinned word for word."
- **SESSION-6** "The summary is saved with the session, so after a restart
  or on a different model it picks up from the summary instead of replaying
  the whole history."
- **SESSION-3.a** "A reply to it, or a message in its thread, after the
  session has expired starts a new session that begins from the old one's
  summary, instead of getting no answer."
- **AGENT-6.a** "A conversation's condensed summary and its recent turns are
  kept, scrubbed, for 30 days per thread, so a restart doesn't lose it
  (MEMORY-1); WATCH follow-ups pick up the issue or PR thread's summary;
  forgetting someone deletes theirs."

This change builds them; it does not capture them again (`grep` finds them
in `hi/session.md` / `hi/agent.md` on the base and `hi check` passes).

Gap on the base (d589638): a Discord session replays its turns in a fixed
6000-char block and drops the middle as `(N earlier turns omitted)` — no
summary, no window (REQ-discord-072 said "No model summarising"); turns die
with the session at the soft TTL, so a reply to an expired session's answer,
or a plain message in its thread, gets no answer; WATCH follow-ups carry only
the newest event (REQ-watch-037 kept "turn persistence/replay and stored
summaries" out of scope); nothing is kept per thread for 30 days and there is
no per-person delete.

Constraints: specs only through SpecSync; v1 off-chain (local SQLite only,
MEMORY-3); owner admins and the team works (no role change here); prefer
existing tables — none can outlive a session (`discord_session_turns` and
`discord_session_bot_messages` cascade with it; `memories` soft-deletes
every update and feeds the memory inject), so one new table by a
forward-only migration (schema v12) with a test; a new env var only where the
captured text needs it (the model's window). #232/#233 are landed
separately and not touched. The forget-me flow itself (#101, MEMORY-ACL-6)
is not built here: this change exposes the per-person delete it calls.
