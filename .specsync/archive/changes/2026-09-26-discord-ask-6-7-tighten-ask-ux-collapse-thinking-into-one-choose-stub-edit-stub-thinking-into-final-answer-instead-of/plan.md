# Plan

1. Capture DISCORD-ASK-6/7 in `hi/discord.md`; document in `docs/discord.md`.
2. Extend ThinkingOutbound with `editMessage` / `deleteMessage`; ThinkingStatus `finalizeContent`, `existingMessageId`, `discard`.
3. Live gateway implements editMessage/deleteMessage; prefer MessageFlags.Ephemeral.
4. Bridge mention + component paths collapse thinking↔stub↔answer; button pick adopts stub as thinking surface.
5. Bump package to 0.0.23; CHANGELOG; fixture tests for collapse.
6. SpecSync check → verify → approve → PR → merge → restart bridge → announce.
