---
change: replying-to-a-session-start-or-work-answer-continues-that-session-discord-2
artifact: requirements
---

# Requirements

DISCORD-2 / DISCORD-2.a (`hi/discord.md`) and SESSION-MULTI-1
(`hi/session.md`). Modified `REQ-discord-002` (delta `deltas/discord.md`):
the `/session start` and `/work` answer message (collapsed thinking message,
or the fallback deferred reply when its id is known) is tracked for its
session, so the owner's reply continues that session with or without the
reply ping, and another user's reply never does. REQ-discord-046 and
REQ-discord-048 are unchanged. No new env vars, flags or slash commands.
