---
change: discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed
artifact: requirements
---

# Requirements

Captured HI violated:

- **DISCORD-6** (hi/discord.md): "Rate limits and mutes stop one user from
  melting the box, without punishing everyone else." A muted or rate-limited
  session owner could keep running agent turns through ask buttons.
- **ALLOW-5** (hi/allow.md): "A denied contact is refused quietly or with a
  short 'not authorized' — it does not keep arguing or doing the work
  anyway." A deny-listed session owner's button press still ran the agent.
- **DISCORD-DENY-3** (hi/discord.md): interactions still need an ack within
  3 s, so an actor deny on a press is the ephemeral zero-width ack, as on
  slash.

Kept: **DISCORD-ASK-3** (a press continues the requester's session),
**ROLES-CHAT-1** (a member who passes by an allowed role can still answer),
**IDENTITY-1** (the owner passes the actor gate when not on the user list).

Modified REQ-discord-010 and REQ-discord-201 (see deltas/discord.md), keeping
their existing text and acceptance bullets. No new slash command, env var,
plugin, table or column.
