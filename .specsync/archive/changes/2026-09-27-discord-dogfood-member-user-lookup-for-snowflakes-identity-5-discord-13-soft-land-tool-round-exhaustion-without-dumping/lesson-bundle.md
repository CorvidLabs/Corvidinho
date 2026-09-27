# Lesson bundle — discord-dogfood-member-user-lookup-for-snowflakes-identity-5-discord-13-soft-land-tool-round-exhaustion-without-dumping

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord dogfood: member/user lookup for snowflakes (IDENTITY-5/DISCORD-13), soft-land tool-round exhaustion without dumping Stopped after N (AGENT-9), chat prefers prose over SpecSync/github thrash (ROLES-CHAT-9); package 0.0.27
- **Kind**: Feature
- **Specs**: discord, agent, plugins
- **Paths**: plugins/discord/, src/agent/execute.ts, src/agent/index.ts, src/agent/task-summary.ts, src/discord/message-router.ts, hi/, tests/, package.json, CHANGELOG.md, docs/discord.md, specs/
- **Acceptance**: IDENTITY-5/DISCORD-13: read-only discord-user-lookup resolves snowflake/@mention/name within DISCORD_GUILD_ID only (refuse other guilds); agent prompt prefers Discord lookup then prose for social chat; SpecSync/git/github/files only when clearly Corvidinho code/product. AGENT-9: tool-round exhaustion returns best prose or a short clarify ask — never 'Stopped after N tool rounds' in Discord chat body (thinking/plumbing may note it). ROLES-CHAT-9: community chat prefers conversational reply. Package 0.0.27; fixture tests cover lookup gate, soft-land summary, and chatBody scrub.

## Evidence

- Verification commit: `55c3a5b490e6f232a4034b3b677b1204604e0180`
- Base commit: `0214ea613515b4b3af079459b42d5a47c036450e`
- Verified by: `specsync check --spec agent --spec discord --spec plugins`

## From the change's context.md

# Context

Dogfood failure (~19:00 MDT 2026-09-26): user asked `bug 304028152194138114 / Gaspar about playing CS2`. The long number is a **Discord snowflake user id**, not a GitHub issue. The bot thrash-looped SpecSync/files/git/github for 8 rounds and posted the raw internal stop reason `Stopped after 8 tool rounds (tools: …)` to the channel — no useful answer about Gaspar/CS2.

Constraints: stay within the configured `DISCORD_GUILD_ID` (no arbitrary guild lookup); do not fight `/workspace/Corvidinho-run`; HI-first (IDENTITY-5, AGENT-9, DISCORD-13, ROLES-CHAT-9 confirmed via this dogfood); package bump 0.0.27.

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
- `specs/plugins/context.md`
