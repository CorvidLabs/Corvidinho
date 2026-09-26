---
change: discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22
artifact: design
---

# Design

MessageCreate cannot post ephemeral content. Two-step UI:

1. Public Choose stub (short ping, no MCQ body) with one button.
2. Requester press → ephemeral interaction reply with option ActionRow.
3. Option press → update ephemeral, resume agent with chosen label.

PendingAsk JSON gains askId, expiresAt, options, stubMessageId (schema v8 column
unchanged). Button pending survives successful chat turns; free-text pending
still clears on substantive continue. Sessions keyed by userId+channel;
reply/thread continue requires author === session.userId.

