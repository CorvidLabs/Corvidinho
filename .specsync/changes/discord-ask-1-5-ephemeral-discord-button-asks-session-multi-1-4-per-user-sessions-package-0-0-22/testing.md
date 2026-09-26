---
change: discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22
artifact: testing
---

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
