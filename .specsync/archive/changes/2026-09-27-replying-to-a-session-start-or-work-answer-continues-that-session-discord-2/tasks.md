---
change: replying-to-a-session-start-or-work-answer-continues-that-session-discord-2
artifact: tasks
---

# Tasks

- [x] Reproduce on origin/main: regression tests for `/session start` and `/work` reply continuity (ping on/off), fallback reply, and another user's reply; 5 of 6 fail before the fix.
- [x] Bridge: wire `trackBotMessage` into `buildSlashCtx()`.
- [x] Fallback: `editReply` may resolve with the reply message id (gateway returns it); `finishSlashWithThinking` tracks it.
- [x] Review: merge origin/main dbe37ce (#216 wired the same bridge closure; keep one); tracking is best effort (a DB write error never leaves the deferred reply unresolved); member A/B + owner-cannot-continue test.
- [x] Delta: Modified REQ-discord-002; `specs/discord/discord.spec.md` (files list, Public API), `specs/discord/testing.md` and `docs/discord.md` updated.
