---
change: replying-to-a-session-start-or-work-answer-continues-that-session-discord-2
artifact: tasks
---

# Tasks

- [x] Reproduce on origin/main: regression tests for `/session start` and `/work` reply continuity (ping on/off), fallback reply, and another user's reply; 5 of 6 fail before the fix.
- [x] Bridge: wire `trackBotMessage` into `buildSlashCtx()`.
- [x] Fallback: `editReply` may resolve with the reply message id (gateway returns it); `finishSlashWithThinking` tracks it.
- [x] Delta: Modified REQ-discord-002; `specs/discord/discord.spec.md` (files list, Public API), `specs/discord/testing.md` and `docs/discord.md` updated.
