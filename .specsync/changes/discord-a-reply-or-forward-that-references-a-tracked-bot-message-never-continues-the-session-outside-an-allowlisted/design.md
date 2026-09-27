---
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
artifact: design
---

# Design

- `routeMessage` (`src/discord/message-router.ts`): after the bot-author
  check, a new `ownChannelAllowlisted(msg, deps)` gate runs before every path:
  `isMonitoredChannel(msg.channelId)` or, for a thread message,
  `isMonitoredChannel(msg.threadId)`. On failure it returns the existing
  silent `refuse` (`channel_not_allowlisted`, no reply) for an @mention and
  `ignore` otherwise. The per-path channel checks on the thread and reply
  paths (which also accepted the session's channel) are removed; the actor
  gate, mute/rate limit and session-owner checks are unchanged.
- `replyReferenceMessageId(reference, { channelId, parentId })` in
  `src/discord/gateway.ts` (pure, exported with `REFERENCE_TYPE_FORWARD = 1`
  and `RawMessageReference`): returns the referenced message id only when the
  reference is not a forward and its channel is the message's raw channel or,
  inside a thread, the thread's parent. MessageCreate uses it for
  `referencedMessageId`. The forward constant stays a plain number so the
  module still does not load discord.js eagerly; a test pins it to
  `discord.js` `MessageReferenceType.Forward`.
- Both layers fail closed on their own: a forward that still reached the
  router (or a future path that sets `referencedMessageId`) is stopped by the
  own-channel gate.
