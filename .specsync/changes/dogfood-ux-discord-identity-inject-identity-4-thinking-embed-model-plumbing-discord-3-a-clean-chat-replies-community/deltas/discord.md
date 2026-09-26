---
module: discord
change: dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community
---

# Delta — discord (IDENTITY-4 + DISCORD-3.a)

## Modified

### SPEC SECTION Public API

`identity-inject.ts` formats/enriches the spawn prompt with acting Discord
user id + resolved display (owner map wins for owner). Gateway fills
`authorDisplayName` / `authorUsername` (and slash `userDisplayName` /
`userUsername`). Bridge and slash handlers inject identity before memory.

`ThinkingStatus` accepts optional `model` and `plumbing`; footer shows model
and, on done/error, plumbing (`state`/`verified`/`verifySkipped`/`attempts`).
Final chat reply content remains human text only (DISCORD-3.a).

### SPEC SECTION Change Log

| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: IDENTITY-4 inject; DISCORD-3.a model+plumbing in thinking footer; clean chat body |
