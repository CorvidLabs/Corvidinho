---
change: discord-call-sites-pass-the-raw-human-message-as-humantext-so-safe-4-memory-confirm-tokens-come-only-from-what-the
artifact: context
---

# Context

#131 (merged) prepends recalled memory to the Discord spawn prompt. PR #128 extracts SAFE-4 confirm tokens for memory forget/override from the human's message; reading them from the enriched prompt would let a token the model stored in memory look human-typed. The call sites now pass the raw human text separately.
