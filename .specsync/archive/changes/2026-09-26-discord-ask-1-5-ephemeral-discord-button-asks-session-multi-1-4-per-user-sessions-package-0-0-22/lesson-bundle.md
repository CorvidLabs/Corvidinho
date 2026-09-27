# Lesson bundle — discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: DISCORD-ASK-1..5 ephemeral Discord button asks + SESSION-MULTI-1..4 per-user sessions; package 0.0.22
- **Kind**: Feature
- **Specs**: discord, agent
- **Paths**: src/discord, src/agent, tests, hi, package.json, CHANGELOG.md
- **Acceptance**: DISCORD-ASK-1..5: asks with 2+ options post Choose stub + ephemeral buttons (TTL ~30m, late press expired); free-text when no options; SESSION-MULTI-1..4: per-user sessions, buttons survive chat, multi-user independence; package 0.0.22; fixture tests green; SpecSync+fledge verify green

## Evidence

- Verification commit: `aca9b27d51a19467c60ea4577ef6b4b7be885de8`
- Base commit: `e8bbd215036e7dc8739ac9159afa19f17ae943c6`
- Verified by: `specsync check --spec agent --spec discord --spec plugins`

## From the change's context.md

# Context

Leif confirmed DISCORD-ASK-1..5 and SESSION-MULTI-1..4: clarify/stuck choices that
fit a short list must use ephemeral Discord buttons (not a public MCQ), expire
after ~30 minutes, and keep per-user sessions so concurrent chatters do not share
history or invalidate each other's open asks. Free-text clarify only when options
cannot be listed. Explicitly rejected: replace-pending-on-new-message.

Live tip was v0.0.21 with reply-based ask-ping + pendingAsk + thin-ack. This change
evolves that path and bumps to package 0.0.22.

## From the change's design.md

# Design

MessageCreate cannot post ephemeral content. Two-step UI:

1. Public Choose stub (short ping, no MCQ body) with one button.
2. Requester press → ephemeral interaction reply with option ActionRow.
3. Option press → update ephemeral, resume agent with chosen label.

PendingAsk JSON gains askId, expiresAt, options, stubMessageId (schema v8 column
unchanged). Button pending survives successful chat turns; free-text pending
still clears on substantive continue. Sessions keyed by userId+channel;
reply/thread continue requires author === session.userId.

## From the change's testing.md

# Testing

- Unit: ask-options parse/normalize; ask-buttons custom ids, TTL, stub vs ephemeral.
- Bridge fixtures: stub+components; open→ephemeral; pick resumes; expired ack;
  chat-while-open keeps pendingAsk; two users independent pending asks.
- Router: multi-user start; non-owner reply does not hijack; same-user reuse;
  deny-listed reply/thread still silent-refuse.
- Regression: thin-ack, ask-ping free-text path, actor-gate, version 0.0.22.
- `bun test` + `fledge lanes run verify --non-interactive` + `specsync check`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-044` | `tests/discord.thin-ack.test.ts`, `tests/discord.ask-ephemeral.test.ts` | Thin ack restates; cancel clears; free-text continue answers; button pending survives chat. |
| `REQ-discord-045` | `tests/discord.ask-buttons.test.ts`, `tests/discord.ask-ephemeral.test.ts` | Stub+Choose components; ephemeral open; pick resumes; expired → ASK_CHOICE_EXPIRED. |
| `REQ-discord-046` | `tests/discord.router.test.ts`, `tests/discord.ask-ephemeral.test.ts`, `tests/discord.actor-gate.test.ts` | Per-user sessions; non-owner no hijack; deny-listed refuse; multi-user pending independent. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts`, `tests/agent.ask.test.ts` | ask-human options populate HumanAsk.options; numbered lines parse. |

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
