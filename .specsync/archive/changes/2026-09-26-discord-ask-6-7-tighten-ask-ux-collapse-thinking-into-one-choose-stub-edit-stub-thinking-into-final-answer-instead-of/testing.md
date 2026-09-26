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
