---
change: a-work-or-session-start-run-that-stopped-to-ask-keeps-the-ask-as-the-session-s-pending-ask-and-its-answer-message
artifact: tasks
---

# Tasks

- [x] Re-verify on current main what #160 left (blocked status fixed; pending ask and answer tracking missing).
- [x] Regression tests `tests/discord.slash-pending-ask.test.ts` that fail on main.
- [x] `/work` and `/session start` store a non-spend-cap ask as the session's free-text pending ask.
- [x] Bridge `buildSlashCtx` wires `trackBotMessage` so the slash answer continues its session.
- [x] Review: tests for `/session start` with options, a `/work` stuck ask (owner-only pings) and another user's reply; `docs/discord.md` ask paragraph updated.
- [x] Delta: Modified REQ-discord-044 (full text + slash bullets); discord spec Public API / invariants / testing notes.
