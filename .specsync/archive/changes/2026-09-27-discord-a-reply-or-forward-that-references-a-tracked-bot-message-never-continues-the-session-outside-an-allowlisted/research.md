---
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
artifact: research
---

# Research

- discord.js 14.27 `Message.reference` is `{ channelId, guildId, messageId, type }`
  from the raw `message_reference`; `type` is `MessageReferenceType`
  (discord-api-types v10: `Default = 0` for replies, `Forward = 1`). The raw
  payload may omit `type` for a reply, so a missing type is treated as a reply.
- A forward carries the source channel in `reference.channelId`; a reply's
  reference points at the same channel (inside a thread, the thread; a reply
  to a thread's starter message points at the parent channel).
- The gateway already resolves a thread message to `channelId = parentId`,
  `threadId = thread id` (DISCORD-2.a). `isMonitoredChannel` is the existing
  channel allowlist check used by the router.
- The session's recorded channel was only ever needed as a fallback that the
  message's own channel already covers (a thread's parent does not change), so
  dropping it removes the bypass without losing a real DISCORD-2 / 2.a flow.
