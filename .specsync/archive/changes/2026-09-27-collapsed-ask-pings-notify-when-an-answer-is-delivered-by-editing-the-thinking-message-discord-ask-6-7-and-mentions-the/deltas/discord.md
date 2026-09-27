---
module: discord
change: collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the
---

# Delta — discord (collapsed answers still notify their mentions)

## Added

### REQUIREMENT REQ-discord-215

Discord does not notify a mention added by a message edit. Whenever the
bridge delivers an answer by editing the thinking (or Choose stub) message
(DISCORD-ASK-6/7: the chat answer, the answer to a run a button pick resumed,
`/work` and `/session start`) and that answer mentions the requester (a
clarify ask, AUTONOMY-4) and/or the configured owner (a stuck ask,
AUTONOMY-2; a spend-cap ask or the 80% warning, SAFE-8), the bridge SHALL
additionally send one short fresh post to the same channel, replying to the
edited answer, whose content is only those mentions with a one-line pointer
(`↑ question for you` for the requester the clarify ask addresses, `↑ needs
you` for everyone else) and whose allowed mentions are exactly those users
(no `@everyone`, `@here` or roles). The bridge SHALL NOT ping a user twice in
one turn: a user a fresh post already pinged (the slash owner notice of
REQ-discord-098) is left out, and the spend cap's once-per-episode owner ping
(`claimCapPing`) still applies, so a spend-cap ask whose episode already
pinged adds no owner ping. When the answer went out as a fresh reply (the
fallback when the edit is unavailable or fails) or mentions nobody, no extra
post SHALL be sent. A chat or button-pick ping post SHALL be tracked like the
answer, so replying to it continues the session (DISCORD-2). The ping is best
effort: a failed or throwing post SHALL NOT fail the turn or undo the
answer. The one-message layout of DISCORD-ASK-6/7 is otherwise unchanged; no
slash command, env var or schema change.

Acceptance Criteria
- A chat clarify ask collapsed into the thinking message (free text or Choose stub) is followed by exactly one fresh post, `<@requester> ↑ question for you`, replying to the edited answer, with allowed mentions exactly the requester; a reply to that post continues the session.
- A chat stuck ask collapsed into the thinking message is followed by exactly one fresh post, `<@owner> ↑ needs you`, with allowed mentions exactly the owner (the requester is not pinged).
- A collapsed clarify ask carrying a pending 80% warning is followed by one post pinging the requester (question) and the owner (needs you), allowed mentions exactly those two.
- Two chat spend-cap stops in one cap episode produce one owner ping post in total.
- A collapsed answer that mentions nobody, an answer delivered as a fallback reply, and a failed ping post add no post; the turn still finishes.
- A button pick whose resumed run gets stuck collapses the stub into the ask and is followed by one owner ping replying to the stub.
- `/work` with a clarify ask collapses the answer, deletes the deferred reply and is followed by one requester ping, with no owner notice.
- `/work` at the spend cap with a pending warning sends exactly one owner post (the REQ-discord-098 notice) and no duplicate ping; `/session start` with a clarify ask by the owner and a pending warning sends only the owner notice.
- When the slash owner notice post fails and is appended to the collapsed answer, one owner ping post follows.
- A slash answer delivered through the deferred reply (no collapse) adds no ping post.
