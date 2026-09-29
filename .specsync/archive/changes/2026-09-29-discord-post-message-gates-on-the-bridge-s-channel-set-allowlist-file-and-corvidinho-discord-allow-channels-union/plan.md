---
change: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
artifact: plan
---

# Plan

1. Regression tests in `tests/discord.post.plugin.test.ts` (fail on base).
2. `plugins/discord/index.ts`: gate on `mergeChannelIds(loaded.config, process.env)`.
3. Spec deltas: modify REQ-plugins-009 and REQ-discord-004; testing
   companions for plugins and discord.
4. `docs/discord.md`: name the channel lists the post gate reads.
5. Same gap in `discord-send-file`: merge in `plugins/discord/send-file.ts`,
   regression test in `tests/discord.send-file.test.ts`, REQ-discord-004 delta
   and the send-file gates bullet in `docs/discord.md`.
