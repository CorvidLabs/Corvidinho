---
module: discord
change: autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package
---

# Delta: discord (AUTONOMY-4..6)

## Modified

### REQUIREMENT REQ-discord-044

Amend: clarify asks SHALL mention the requester Discord id
(`requesterDiscordId`), not the owner by default. Stuck asks SHALL mention
the configured owner (AUTONOMY-2/4). When the requester is the owner, clarify
naturally pings the owner.

Sessions SHALL persist `pendingAsk` (schema v8 `pending_ask`). While set,
a thin-ack continue SHALL restate the ask via `formatAskReply` and SHALL NOT
spawn the agent to done (AUTONOMY-5). An explicit cancel clears pending ask
(AUTONOMY-6). A substantive continue clears pending and runs the agent with
prior-question context.

The discord spec `files:` list SHALL include `src/discord/thin-ack.ts` and `tests/discord.thin-ack.test.ts`.

Acceptance Criteria
- Clarify mentionUserIds is [requester] when provided; stuck is [owner].
- Thin ack on blocked session restates question; pendingAsk remains.
- Cancel clears pendingAsk with a short ack.
- Substantive continue runs agent; prior question is in the prompt context.
