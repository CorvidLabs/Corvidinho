---
module: agent
change: dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community
---

# Delta — agent (DISCORD-3.a chat/plumbing + identity/public Q&A prompt)

## Modified

### SPEC SECTION Public API

`task-summary` exports `formatTaskPlumbing`, `chatBodyFromTaskResult`, and
`chatBodyFromTaskRunOutput` alongside `summarizeTaskResult`. Discord/NDJSON
bridge summaries SHALL use the chat-body helpers so operator plumbing never
appears in the final chat reply (DISCORD-3.a).

`execute` system prompt SHALL include IDENTITY-4 and ROLES-CHAT-8 instruction
blocks (`IDENTITY_AGENT_SYSTEM_INSTRUCTIONS`, `PUBLIC_QA_AGENT_SYSTEM_INSTRUCTIONS`)
in addition to MEMORY instructions.

### SPEC SECTION Change Log

| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: chat/plumbing split for Discord summaries; identity + public Q&A system instructions |
