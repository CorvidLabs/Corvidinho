---
change: discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22
artifact: testing
---

# Testing

- Unit: ask-options parse/normalize; ask-buttons custom ids, TTL, stub vs ephemeral.
- Bridge fixtures: stub+components; open→ephemeral; pick resumes; expired ack;
  chat-while-open keeps pendingAsk; two users independent pending asks.
- Router: multi-user start; non-owner reply does not hijack; same-user reuse.
- Regression: thin-ack, ask-ping free-text path, existing discord router tests.

