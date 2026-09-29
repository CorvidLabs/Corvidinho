---
change: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
artifact: tasks
---

# Tasks

- [x] Regression tests in `tests/discord.post.plugin.test.ts`: a channel only in `DISCORD_CHANNEL_IDS` posts in dry run (and a channel in no list is refused); a deny on the same channel still refuses with exit 3.
- [x] Prove the `DISCORD_CHANNEL_IDS`-only test fails with the base `plugins/discord/index.ts` swapped in, then restore.
- [x] `plugins/discord/index.ts` gates on `mergeChannelIds(loaded.config, process.env)` with deny lists first.
- [x] Spec deltas: REQ-plugins-009 and REQ-discord-004 modified; `specs/plugins/testing.md` and `specs/discord/testing.md` evidence.
- [x] `docs/discord.md` names the lists the post gate reads.
- [x] Same gap in `discord-send-file`: `plugins/discord/send-file.ts` gates `parent || channelId` on the merged set; regression test in `tests/discord.send-file.test.ts` (channel and thread parent only in `DISCORD_CHANNEL_IDS` attach, a channel in no list and a denied one refused) fails with the base `send-file.ts` and passes after; REQ-discord-004 delta names it; `docs/discord.md` send-file gates bullet.
