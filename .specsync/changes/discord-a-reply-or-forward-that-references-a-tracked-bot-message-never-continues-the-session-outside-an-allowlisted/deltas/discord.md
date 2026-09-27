---
module: discord
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
---

# Delta: discord (a reply or forward never continues a session outside an allowlisted channel, DISCORD-5 / DISCORD-DENY-1)

## Added

### REQUIREMENT REQ-discord-212

The bridge SHALL process a MessageCreate only when the message's own channel
is allowlisted (DISCORD-5): the thread's parent channel (the DISCORD-2.a
resolution) or the thread itself. This gate SHALL run before the thread,
reply-to-bot and mention paths, and the channel recorded on a session SHALL
NOT stand in for it, so a message that references a tracked bot message
from an allowlisted channel never continues that session, spawns the agent,
or posts or edits anything in a channel that is not allowlisted. Refusal
SHALL be silent (DISCORD-DENY-1): no public reply, no DM, no reaction.

The gateway SHALL set `InboundMessage.referencedMessageId` only for a reply
in the message's own channel: a reference of type
`MessageReferenceType.Forward` SHALL be dropped, and so SHALL a reference
whose channel is neither the message's channel nor, inside a thread, the
thread's parent channel. A reply in the same allowlisted channel SHALL still
continue its session (DISCORD-2), and a thread under an allowlisted parent
SHALL still continue its session (DISCORD-2.a). No slash command, env var,
table or column is added.

Acceptance Criteria
- The owner forwards a tracked bot message from an allowlisted channel into a non-allowlisted channel (with or without an @mention): `routeMessage` returns a silent `ignore` / `refuse` with no reply, the agent is not spawned, and nothing is sent, edited or deleted in that channel.
- A thread message under a non-allowlisted parent does not continue a session whose recorded channel is allowlisted.
- `replyReferenceMessageId` returns undefined for a forward-type reference and for a reference to another channel; it returns the message id for a same-channel reply (default or missing type) and, inside a thread, for a reference to the thread or its parent.
- A reply to a tracked bot message in the same allowlisted channel still continues the same session; a thread under an allowlisted parent still continues its session.
