---
change: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
artifact: research
---

# Research

- `mergeChannelIds(allowlist, env)` (`src/discord/config.ts`) is the one
  existing union of `allowlist.discord.channels` and `DISCORD_CHANNEL_IDS`
  (lower-cased, deduped). The bridge, the daemon (`daemonGate`) and `doctor`'s
  discord check already use it.
- `checkChannel(channelId, cfg)` (`src/allowlist/discord.ts`) accepts either an
  `AllowlistConfig` or its `discord` section, and checks `denyChannels` before
  the empty / listed checks, so a deny still wins after the merge.
- `tryLoadAllowlist` keeps failing closed on a malformed / unreadable file
  (REQ-plugins-006); the merge runs only after it loaded.
- `tests/discord.post.plugin.test.ts` deleted `DISCORD_CHANNEL_IDS` in its
  empty-allowlist case and had no case for the merge.
