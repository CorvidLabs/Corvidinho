---
change: discord-bridge-and-session-start-and-work-pass-the-raw-human-message-as-humantext-so-safe-4-memory-confirm-tokens-are
artifact: context
---

# Context

#131 (merged) prepends recalled memory to the Discord spawn prompt. The #128 hardening extracted SAFE-4 confirm tokens from that prompt, so a token the model had stored in memory would look human-typed. This change threads the raw human text to the agent client.
