---
change: discord-ask-8-clear-ephemeral-choice-buttons-on-pick-and-delete-got-it-working-ephemeral-after-resume
artifact: testing
---

# Testing

```bash
bun test tests/discord.ask-ephemeral.test.ts
```

| Requirement | Evidence |
|---|---|
| REQ-discord-049 | `tests/discord.ask-ephemeral.test.ts` — pick clears components, deleteReply after resume, re-press already/no second call |
