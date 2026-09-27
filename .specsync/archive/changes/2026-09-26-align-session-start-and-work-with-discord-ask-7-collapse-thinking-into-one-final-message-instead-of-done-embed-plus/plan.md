---
change: align-session-start-and-work-with-discord-ask-7-collapse-thinking-into-one-final-message-instead-of-done-embed-plus
artifact: plan
---

# Plan

1. Amend HI DISCORD-ASK-7 + REQ-discord-048 to name `/session start` / `/work`.
2. Add `finishSlashWithThinking` helper; wire session + work handlers; `deleteReply` on slash adapter.
3. Fix `finalizeContent` to close only on successful edit (fallback Done still works).
4. Fixture tests in `tests/discord.slash-ask7.test.ts`; bump 0.0.25 + CHANGELOG.
5. SpecSync check → verify → PR → merge → restart bridge (announce).
