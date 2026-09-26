---
change: dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| IDENTITY-4 | `tests/discord.identity-inject.test.ts` | Owner display wins; no invented names; inject block has id + display. |
| DISCORD-3.a | `tests/spawn.argv.test.ts`, `tests/discord.thinking-status.test.ts`, `tests/agent.ndjson-spawn.test.ts`, `tests/agent.events-ndjson.test.ts` | Chat body has no `state=`; footer carries plumbing + model. |
| ROLES-CHAT-8 | `tests/github.public.community.test.ts`, `tests/files.secret-path.test.ts` | Community public allow / private refuse; deny wins; secret paths flagged. |

## Automated coverage

- `bun test tests/discord.identity-inject.test.ts tests/discord.thinking-status.test.ts tests/spawn.argv.test.ts tests/github.public.community.test.ts tests/files.secret-path.test.ts tests/agent.ndjson-spawn.test.ts tests/agent.events-ndjson.test.ts`
- `fledge lanes run verify --non-interactive`
