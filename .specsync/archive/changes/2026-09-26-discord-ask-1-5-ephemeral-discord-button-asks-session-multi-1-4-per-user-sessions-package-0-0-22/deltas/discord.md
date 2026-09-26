---
module: discord
change: discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22
---

# Delta: discord (DISCORD-ASK / SESSION-MULTI)

## Modified

### REQUIREMENT REQ-discord-044

Sessions SHALL persist `pendingAsk` (including askId / expiresAt / optional
options). While set, a thin-ack continue SHALL restate the ask (stub+Choose
when options; formatAskReply when free-text) and SHALL NOT spawn the agent.
An explicit cancel SHALL clear pending ask. For free-text pending (no
options), a substantive continue SHALL clear pending and run the agent with
prior-question context. For button pending (has options), ordinary chat SHALL
continue the conversation WITHOUT clearing pending; only button pick, cancel,
or expiry SHALL clear it. Clarify asks SHALL mention the requester; stuck
asks SHALL mention the configured owner.

Acceptance Criteria
- Clarify mentionUserIds is [requester] when provided; stuck is [owner].
- Thin ack restates; pendingAsk remains.
- Cancel clears pendingAsk.
- Free-text substantive continue clears pending and runs agent.
- Button pending survives unrelated chat turns until pick/cancel/expiry.

### REQUIREMENT REQ-discord-045

When an ask has two or more options (from ask-human `options` or a numbered
list parsed from the question), the bridge SHALL post a short public Choose
stub with a button, and on requester press SHALL reply with an ephemeral
interaction listing the option buttons. Button prompts SHALL expire after
about 30 minutes; a late press SHALL get a short "that choice expired".
Free-text clarify SHALL be used only when options cannot be listed.

Acceptance Criteria
- Structured or numbered options → stub + components; ephemeral open shows choices.
- Pick resumes the requester session with the chosen label.
- Expired press returns ASK_CHOICE_EXPIRED and clears pending.
- Question without listable options keeps the free-text ask-ping path.

### REQUIREMENT REQ-discord-046

Concurrent users in one channel SHALL each have their own session keyed by
Discord user id (+ channel / thread). Reply-to-bot and thread continue SHALL
only resume when the message author owns that session. Other users talking
while one has an open button ask SHALL not share history or invalidate the
other's buttons. Memory inject SHALL remain scoped to the acting Discord user.

Acceptance Criteria
- Two @mentions from different users yield two session ids.
- A non-owner reply to another user's bot message does not continue that session.
- Same user @mention reuses their active session in the channel.
