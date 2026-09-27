---
module: discord
change: thin-ack-gate-ignores-identity-5-mention-trailer-so-bot-ok-still-restates-pending-asks-follow-up-to-discord-user-lookup
---

# Delta — discord (thin-ack vs mention trailer)

## Added

### REQUIREMENT REQ-discord-313

When inbound content is rewritten for IDENTITY-5 mention preservation, the chat body used for AUTONOMY-5/6 thin-ack and cancel detection SHALL ignore the mention trailer / `Discord user id` annotations so that messages like `<@bot> ok` still thin-ack a pending ask without spawning the agent. The full prompt (including the trailer) SHALL still be passed to the agent on substantive continues.

Acceptance Criteria
- `stripMentions("<@999> ok")` body line is `ok` and includes a mentioned trailer with the snowflake.
- Bridge pending-ask path: `@mention ok` restates without a second agent run (`tests/discord.slash-pending-ask.test.ts`).
