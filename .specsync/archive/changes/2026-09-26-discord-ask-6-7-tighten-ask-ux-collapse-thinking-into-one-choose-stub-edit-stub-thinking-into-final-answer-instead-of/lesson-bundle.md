# Lesson bundle — discord-ask-6-7-tighten-ask-ux-collapse-thinking-into-one-choose-stub-edit-stub-thinking-into-final-answer-instead-of

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: DISCORD-ASK-6/7 tighten ask UX: collapse thinking into one Choose stub; edit stub/thinking into final answer instead of Done+extra reply; package 0.0.23
- **Kind**: Feature
- **Specs**: discord
- **Paths**: hi/discord.md, docs/discord.md, src/discord/thinking-status.ts, src/discord/gateway.ts, src/discord/bridge.ts, src/discord/index.ts, tests/discord.ask-ephemeral.test.ts, tests/discord.thinking-bridge.test.ts, tests/discord.thinking-status.test.ts, package.json, CHANGELOG.md, specs/discord/
- **Acceptance**: Button ask posts one public Choose stub (thinking collapsed into stub, no separate Needs your input). Success/done after mention or button pick edits that stub/thinking into the final answer when practical (no extra Done + new reply). Ephemeral Choose→options unchanged. Package 0.0.23; tests cover collapse paths.

## Evidence

- Verification commit: `8c069bbbd89ee1c66d246660cd567d327e7c08f3`
- Base commit: `faa569f4ac361e7a3eff3ae3a2047227410c803d`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Leif dogfooding 0.0.22 ephemeral button asks saw duplicate Discord noise: the thinking embed flipped to "Needs your input" / "✅ Done" while a separate channel reply posted the Choose stub or final answer. Confirmed intent: tighten ask UX (DISCORD-ASK-6/7) while keeping ephemeral Choose → options.

Tip at change start: `faa569f` (v0.0.22).

## From the change's testing.md

# Testing

## Commands

```bash
bun test tests/discord.ask-ephemeral.test.ts tests/discord.thinking-bridge.test.ts tests/discord.thinking-status.test.ts tests/discord.ask-buttons.test.ts
```

## Requirement evidence

| Requirement | Evidence |
|---|---|
| REQ-discord-047 | `tests/discord.ask-ephemeral.test.ts` — "structured options → public stub": replies length 0; Choose contentEdit on progress message; no "Needs your input" Done embed. |
| REQ-discord-048 | `tests/discord.thinking-bridge.test.ts` — mention collapses into echo contentEdit (no Done+reply). `tests/discord.ask-ephemeral.test.ts` — pick resumes and edits stub into "Using Postgres". `tests/discord.thinking-status.test.ts` — finalizeContent + existingMessageId unit coverage. |

## Where these lessons go

- `specs/discord/context.md`
