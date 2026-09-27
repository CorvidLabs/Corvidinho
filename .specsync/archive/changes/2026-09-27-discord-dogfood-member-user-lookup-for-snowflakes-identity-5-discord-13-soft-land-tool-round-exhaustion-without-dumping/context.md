---
change: discord-dogfood-member-user-lookup-for-snowflakes-identity-5-discord-13-soft-land-tool-round-exhaustion-without-dumping
artifact: context
---

# Context

Dogfood failure (~19:00 MDT 2026-09-26): user asked `bug 304028152194138114 / Gaspar about playing CS2`. The long number is a **Discord snowflake user id**, not a GitHub issue. The bot thrash-looped SpecSync/files/git/github for 8 rounds and posted the raw internal stop reason `Stopped after 8 tool rounds (tools: …)` to the channel — no useful answer about Gaspar/CS2.

Constraints: stay within the configured `DISCORD_GUILD_ID` (no arbitrary guild lookup); do not fight `/workspace/Corvidinho-run`; HI-first (IDENTITY-5, AGENT-9, DISCORD-13, ROLES-CHAT-9 confirmed via this dogfood); package bump 0.0.27.
