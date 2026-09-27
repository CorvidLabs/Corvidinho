---
change: discord-dogfood-member-user-lookup-for-snowflakes-identity-5-discord-13-soft-land-tool-round-exhaustion-without-dumping
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-312` | `tests/discord.user-lookup.test.ts` | Plugin listed non-dangerous; missing guild / wrong `--guild` refuse exit 3; dry-run by id and query; mocked REST returns displayName Gaspar; mocked 404 → not-a-member. |
| `REQ-agent-312` | `tests/agent.soft-land.test.ts` | softLand helper prefers prose / clarify ask; chatBody strips `Stopped after`; tool-loop exhaustion with no prose → clarify ask + operator Text; exhaustion with prior prose keeps that prose. |
| `REQ-discord-312` | `tests/agent.soft-land.test.ts`, `tests/discord.user-lookup.test.ts` | `stripMentions` rewrites `<@id>` to `Discord user id <id>`; package 0.0.27 + docs/CHANGELOG cover lookup and soft-land. |

## Automated coverage

- `bun test tests/discord.user-lookup.test.ts tests/agent.soft-land.test.ts`
- `bunx tsc --noEmit`
- `bun test`
- `fledge lanes run verify --non-interactive`
