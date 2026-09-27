---
change: discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per
artifact: docs
---

# Docs

- `docs/discord.md` (Questions and owner ping): keep chatting while buttons
  are open; a later ask leaves the earlier Choose buttons working until pressed
  or expired (SESSION-MULTI-3); thin reply restates the newest; `cancel`
  clears every open ask; pending asks (plural) survive a restart.
- `specs/discord/discord.spec.md`: Public API prose for `pendingAsk` /
  `openAsks` / `setPendingAsk` / `clearPendingAsk` / `findPendingAsk` and
  the `pending_ask` shape; new Behavioral Example scenario.
- `specs/discord/testing.md`: coverage note for the new tests.
