---
module: discord
change: discord-dogfood-member-user-lookup-for-snowflakes-identity-5-discord-13-soft-land-tool-round-exhaustion-without-dumping
---

# Delta — discord (mention rewrite + chat discipline)

## Added

### REQUIREMENT REQ-discord-312

Inbound Discord chat content that mentions a user as `<@id>` or `<@!id>` SHALL be rewritten to `Discord user id <id>` before the agent prompt so the snowflake remains available for `discord-user-lookup` (IDENTITY-5). Mentions SHALL NOT be stripped to empty. Package version SHALL be `0.0.27` with CHANGELOG and docs covering lookup, soft-land, and chat tool discipline (DISCORD-13 / ROLES-CHAT-9). Discord channel replies from tool-round exhaustion SHALL never show the raw internal stop reason (AGENT-9 / REQ-agent-312).

Acceptance Criteria
- `stripMentions("hey <@3040…>")` contains `Discord user id 3040…`.
- Package `0.0.27`; CHANGELOG + `docs/discord.md` document lookup and soft-land.
- Fixture coverage via soft-land + user-lookup tests.
