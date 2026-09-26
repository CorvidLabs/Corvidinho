---
change: discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22
artifact: context
---

# Context

Leif confirmed DISCORD-ASK-1..5 and SESSION-MULTI-1..4: clarify/stuck choices that
fit a short list must use ephemeral Discord buttons (not a public MCQ), expire
after ~30 minutes, and keep per-user sessions so concurrent chatters do not share
history or invalidate each other's open asks. Free-text clarify only when options
cannot be listed. Explicitly rejected: replace-pending-on-new-message.

Live tip was v0.0.21 with reply-based ask-ping + pendingAsk + thin-ack. This change
evolves that path and bumps to package 0.0.22.

