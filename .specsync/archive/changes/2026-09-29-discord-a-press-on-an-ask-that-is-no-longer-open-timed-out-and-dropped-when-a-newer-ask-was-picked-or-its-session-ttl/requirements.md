---
change: discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl
artifact: requirements
---

# Requirements

Captured HI (hi/discord.md, already on main; nothing new captured):

- **DISCORD-ASK-5**: "Button prompts expire after about 30 minutes; a late
  press gets a short 'that choice expired'." A press on an ask dropped after
  its timeout, or on an ask of a TTL-purged session, got "This choice isn't
  for you (or it was already answered)".

Kept: **DISCORD-ASK-2/3** (only the requester sees and answers the choice;
another user's press stays not-for-you), **DISCORD-ASK-8** (a re-press after
a pick is a no-op, not a second resume), **SESSION-2** (soft TTL unchanged),
**SAFE-6** (no question text kept for closed asks), #232's gate order
(REQ-discord-212 / 201 / 010).

Modified REQ-discord-045 (see deltas/discord.md), keeping its text and
acceptance bullets. No new slash command, env var, plugin, table or column.
