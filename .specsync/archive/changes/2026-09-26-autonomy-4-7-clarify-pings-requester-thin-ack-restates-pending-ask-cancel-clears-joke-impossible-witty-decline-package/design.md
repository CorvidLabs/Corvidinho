---
change: autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package
artifact: design
---

# Design

**ask-ping:** `FormatAskReplyOpts.requesterDiscordId`. Clarify → mention
requester; stuck → mention owner. `pinged` = any mention; `ownerPinged` =
owner in mentions. Bridge passes `msg.authorId`; scheduler passes
`createdByUserId` for clarify.

**pendingAsk:** `SessionStub.pendingAsk: HumanAsk | null`; SQLite column
`discord_sessions.pending_ask` (JSON, schema v8). Set when result has ask;
clear on cancel or substantive continue start (and when a non-ask result
finishes).

**thin-ack:** pure `isThinAck` / `isCancelAsk` in `src/discord/thin-ack.ts`.
Bridge continue: if pendingAsk && thin → formatAskReply restate, no agent; if
cancel → clear + short ack; else prepend prior-question context and run agent.

**AUTONOMY-7:** one sentence on `ASK_AGENT_SYSTEM_INSTRUCTIONS`.
