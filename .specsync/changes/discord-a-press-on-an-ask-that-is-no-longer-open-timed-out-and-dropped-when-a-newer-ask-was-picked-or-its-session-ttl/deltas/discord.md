---
module: discord
change: discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl
---

# Delta: discord (a press on an ask that is no longer open replies "that choice expired", DISCORD-ASK-5 / REQ-discord-045)

## Modified

### REQUIREMENT REQ-discord-045

When an ask has two or more options (from ask-human `options` or a numbered
list parsed from the question), the bridge SHALL post a short public Choose
stub with a button, and on requester press SHALL reply with an ephemeral
interaction listing the option buttons. Button prompts SHALL expire after
about 30 minutes; a late press SHALL get a short "that choice expired".
Free-text clarify SHALL be used only when options cannot be listed.

A late press SHALL include the requester's Choose or option press on an ask
that is no longer open because it timed out and was dropped, not promoted,
when a newer ask of the session was cleared (REQ-discord-044), or because its
session was TTL-purged (SESSION-2 / REQ-discord-019), at runtime or while the
store loads after a restart. Such a press SHALL get the ephemeral
`ASK_CHOICE_EXPIRED` reply, with no agent run, no new session and nothing
posted or edited, never "This choice isn't for you (or it was already
answered)". A still-stored ask past its timeout SHALL keep that reply and be
cleared, and a later press on it SHALL again get `ASK_CHOICE_EXPIRED`. A
re-press after a pick and a press after an explicit cancel SHALL stay no-ops
with today's reply (DISCORD-ASK-8), also once the session is purged. Another
user's press on a live ask, or on an ask that is no longer open, SHALL get
the not-for-you reply and SHALL NOT resume anything (DISCORD-ASK-2/3). The
channel, actor and mute/rate gates (REQ-discord-212 / REQ-discord-201 /
REQ-discord-010) SHALL run before this reply. To tell a late press from
another user's, `SessionStore` SHALL keep, for each ask that leaves past its
timeout or with its purged session, only its askId, the session's Discord
user and the ask's expiry (`findClosedAsk`), in memory only and bounded to
the newest `CLOSED_ASKS_MAX` (1000), never the question or option text
(SAFE-6). No new env var, slash command, table or column.

Acceptance Criteria
- Structured or numbered options → stub + components; ephemeral open shows choices.
- Pick resumes the requester session with the chosen label.
- Expired press returns ASK_CHOICE_EXPIRED and clears pending.
- Question without listable options keeps the free-text ask-ping path.
- When the newest ask is picked while an earlier open ask has timed out, the requester's Choose and option press on the dropped earlier ask each get exactly the ephemeral `ASK_CHOICE_EXPIRED`; the agent does not run and nothing is posted or edited; another user's press on it gets the not-for-you reply.
- With two open asks (neither timed out) and the session idle past its TTL, the requester's Choose and option press on each get the ephemeral `ASK_CHOICE_EXPIRED`, no agent run, no session is created and nothing is posted; another user's press on each gets the not-for-you reply, as it does on the live ask before the purge.
- A still-stored ask past its timeout: the first press gets `ASK_CHOICE_EXPIRED` and clears it; a second press by the requester gets `ASK_CHOICE_EXPIRED` again, another user's the not-for-you reply, and the agent does not run.
- A re-press after a pick and a press after `cancel` get the not-for-you / already-answered reply with no run, before and after the session is TTL-purged.
- A muted or deny-listed requester's press on an ask of a TTL-purged session gets `MUTED` / the zero-width ack; once let through the press gets `ASK_CHOICE_EXPIRED`, with no run and nothing posted.
- `SessionStore.findClosedAsk` returns `{ askId, userId, expiresAt }` (no question or option text) for an earlier ask dropped when the newest is cleared, an ask cleared past its timeout, every open ask of a TTL-purged session and every ask of a session row purged on load; never for a pick of a live ask, a cancel or an askId stored again; past `CLOSED_ASKS_MAX` the oldest is forgotten.
