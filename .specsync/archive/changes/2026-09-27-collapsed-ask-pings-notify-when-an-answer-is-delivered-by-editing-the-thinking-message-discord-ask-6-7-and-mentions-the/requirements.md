---
change: collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the
artifact: requirements
---

# Requirements

AUTONOMY-2 (owner pinged when stuck), AUTONOMY-4 (clarify asks ping the
requester), SAFE-8 (owner warned at 80%, asked at the cap) and DISCORD-ASK-6/7
(one message) from `hi/autonomy.md`, `hi/safe.md`, `hi/discord.md`.
Added REQ-discord-215: an answer collapsed into the thinking message that
mentions anyone is followed by one short fresh ping post (reply to the edited
answer, only the mentions plus a one-line pointer, allowed mentions exactly
those users); no ping for a fallback reply, for an answer with no mention, or
for a user a fresh post already pinged this turn (slash owner notice,
REQ-discord-098); the spend-cap once-per-episode claim still applies; best
effort. REQ-discord-048 and REQ-discord-098 are unchanged (their one-message
layout and fresh owner notice stay). No slash command, env var or schema.
