# Lesson bundle — thin-ack-gate-ignores-identity-5-mention-trailer-so-bot-ok-still-restates-pending-asks-follow-up-to-discord-user-lookup

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Thin-ack gate ignores IDENTITY-5 mention trailer so <@bot> ok still restates pending asks (follow-up to discord-user-lookup soft-land)
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/bridge.ts, src/discord/message-router.ts, tests/agent.soft-land.test.ts, tests/discord.slash-pending-ask.test.ts
- **Acceptance**: After stripMentions appends [mentioned: Discord user id …], isThinAck/isCancelAsk run on promptBodyForAskGate(prompt) so '<@bot> ok' still thin-acks a pending ask (AUTONOMY-5/6) while the full prompt keeps snowflakes for discord-user-lookup (IDENTITY-5). Fixture: tests/discord.slash-pending-ask.test.ts fallback @mention ok.

## Evidence

- Verification commit: `6f17044d46aa9a6ee72adea7ce2b579c7e4a8752`
- Base commit: `c200ca2e34d7e2dc4a2599f7e04d5417e7606fa2`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

Follow-up to the soft-land / user-lookup ship: preserving mention snowflakes as inline text broke AUTONOMY-5 thin-ack (`<@bot> ok` no longer matched). Fix: mention trailer + ask-gate body strip.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-313` | `tests/discord.slash-pending-ask.test.ts`, `tests/agent.soft-land.test.ts` | Fallback @mention "ok" restates pending ask without a second agent run; stripMentions keeps body "ok" + mentioned trailer. |

## Automated coverage

- `bun test tests/discord.slash-pending-ask.test.ts tests/agent.soft-land.test.ts`

## Where these lessons go

- `specs/discord/context.md`
