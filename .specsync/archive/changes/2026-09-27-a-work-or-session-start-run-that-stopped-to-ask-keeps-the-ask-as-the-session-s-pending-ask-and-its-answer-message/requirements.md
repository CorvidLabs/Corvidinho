---
change: a-work-or-session-start-run-that-stopped-to-ask-keeps-the-ask-as-the-session-s-pending-ask-and-its-answer-message
artifact: requirements
---

# Requirements

Modified REQ-discord-044 (full existing text kept): a `/work` or
`/session start` run that stopped with a clarify or stuck ask SHALL keep it
as the session's free-text pending ask, and the slash answer message SHALL be
bound to the session so a reply to it continues the session; the existing
thin-ack / cancel / substantive rules then apply unchanged. A spend-cap stop
is never pending (as REQ-discord-098 already says). Acceptance bullets added
for the slash path. Served HI: AUTONOMY-1, AUTONOMY-5, AUTONOMY-6. No new
slash command, env var or schema change.
