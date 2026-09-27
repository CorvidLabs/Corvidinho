---
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
artifact: requirements
---

# Requirements

Captured HI violated:

- **DISCORD-5** (hi/discord.md): "It only listens and posts in channels I
  allowlisted. Outside those channels ... refuse means: silent for non-admins
  ... never a public 'not authorized' leak." The bot listened and posted in a
  non-allowlisted channel when a message there referenced a tracked bot
  message.
- **DISCORD-DENY-1** (hi/discord.md): "If a message or slash arrives outside
  an allowlisted channel ..., Corvidinho does not send any public channel
  reply." MessageCreate outside the allowlist is now silent on every path.

Kept: **DISCORD-2** (a reply to a bot message continues the same session) and
**DISCORD-2.a** (a thread keeps one session) for messages whose own channel is
allowlisted.

Added REQ-discord-212 (see deltas/discord.md). No new slash command, env var,
plugin, table or column.
