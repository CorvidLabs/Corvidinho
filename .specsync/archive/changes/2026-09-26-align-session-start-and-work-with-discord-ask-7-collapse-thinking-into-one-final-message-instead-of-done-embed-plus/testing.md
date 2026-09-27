---
change: align-session-start-and-work-with-discord-ask-7-collapse-thinking-into-one-final-message-instead-of-done-embed-plus
artifact: testing
---

# Testing

## Commands

```bash
bun test tests/discord.slash-ask7.test.ts tests/discord.thinking-status.test.ts tests/discord.thinking-bridge.test.ts tests/discord.session-worktree.test.ts
```

## Requirement evidence

| Requirement | Evidence |
|---|---|
| REQ-discord-048 | `tests/discord.slash-ask7.test.ts` — /session and /work collapse + deleteReply; fallback Done+editReply without editMessage. Prior mention/pick coverage unchanged in thinking-bridge / ask-ephemeral. |
