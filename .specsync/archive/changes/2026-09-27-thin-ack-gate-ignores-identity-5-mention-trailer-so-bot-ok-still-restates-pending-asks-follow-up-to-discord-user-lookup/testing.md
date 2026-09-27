---
change: thin-ack-gate-ignores-identity-5-mention-trailer-so-bot-ok-still-restates-pending-asks-follow-up-to-discord-user-lookup
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-313` | `tests/discord.slash-pending-ask.test.ts`, `tests/agent.soft-land.test.ts` | Fallback @mention "ok" restates pending ask without a second agent run; stripMentions keeps body "ok" + mentioned trailer. |

## Automated coverage

- `bun test tests/discord.slash-pending-ask.test.ts tests/agent.soft-land.test.ts`
