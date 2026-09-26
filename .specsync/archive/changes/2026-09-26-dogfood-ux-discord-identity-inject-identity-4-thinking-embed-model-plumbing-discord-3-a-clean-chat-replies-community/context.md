---
change: dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community
artifact: context
---

# Context

Leif dogfood on Discord (owner id 181969874455756800):

1. Bot called him "Kyn" on first reply — model guessed a name instead of using Discord user id / owner display.
2. Final chat replies leaked plumbing: `state=done verified=false verifySkipped attempts=1`.
3. Thinking embed should show model + useful status; plumbing belongs in the embed, not the chat body.
4. Public-channel Q&A: answer from any public GitHub + site/roadmap; never private repos or secrets (confirmed ROLES-CHAT-8).

HI captured thin: IDENTITY-4, DISCORD-3.a, ROLES-CHAT-8.
