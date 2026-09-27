# Lesson bundle — discord-ask-8-clear-ephemeral-choice-buttons-on-pick-and-delete-got-it-working-ephemeral-after-resume

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: DISCORD-ASK-8: clear ephemeral choice buttons on pick and delete Got-it Working ephemeral after resume
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/bridge.ts, src/discord/gateway.ts, tests/discord.ask-ephemeral.test.ts, hi/discord.md, specs/discord/requirements.md, specs/discord/discord.spec.md, CHANGELOG.md
- **Acceptance**: Pick update clears components ([]); pendingAsk null before resume; re-press no second resume; deleteReply called after resume when available. HI DISCORD-ASK-8 + REQ-discord-049. tests/discord.ask-ephemeral.test.ts covers.

## Evidence

- Verification commit: `8d3a57fa7fcb6d6265380bee8f695a7a125d9d00`
- Base commit: `4f489b6c11c4b1665c3f5e1c4c06348042d5be17`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Leif dogfood: after button pick, ephemeral "Got it — Working on it…" stayed visible
with (or allowing) further presses. pendingAsk was already cleared, but buttons
were not stripped on update and the ephemeral was never deleted after resume.

## From the change's testing.md

# Testing

```bash
bun test tests/discord.ask-ephemeral.test.ts
```

| Requirement | Evidence |
|---|---|
| REQ-discord-049 | `tests/discord.ask-ephemeral.test.ts` — pick clears components, deleteReply after resume, re-press already/no second call |

## Where these lessons go

- `specs/discord/context.md`
