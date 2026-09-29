---
change: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
artifact: requirements
---

# Requirements

Captured HI met (no new criteria invented; no `hi/` edits):

- **ROLES-CHAT-3** (hi/roles.md): "Refusal is silent to the channel except a
  short in-session \"not allowed for your role\" in the agent summary." The
  summary a non-ADMIN run posts (chat, `/work`, `/session start`, schedules,
  WATCH) now keeps that note when a later cap shortens it.
- **ROLES-CHAT-2** (hi/roles.md): non-ADMIN Discord / GitHub sessions are role
  sessions, so schedules (never ADMIN) and WATCH runs are where the note appears.
- **SAFE-8** (hi/safe.md): the 80% warning line still fits in the post; the
  body it shortens keeps the note.

Canonical requirements changed (see deltas):
- **REQ-discord-734** (Added): schedule run row + post, `/work` and
  `/session start` answers fitted under 1900, and `appendPostLine` keep the note.
- **REQ-watch-734** (Added): the WATCH summary comment's 1200-char clip keeps
  the note, scrub first.

REQ-agent-333 is not modified: its chat-body and result-frame caps already
keep the note, and `clipKeepingRoleNote` is its existing export.
REQ-watch-231 is not modified: the scrub still runs before the clip.
