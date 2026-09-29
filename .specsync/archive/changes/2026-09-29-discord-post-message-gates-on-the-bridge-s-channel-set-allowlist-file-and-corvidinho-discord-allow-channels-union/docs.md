---
change: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
artifact: docs
---

# Docs

- `docs/discord.md` (discord-post-message section): the channel allowlist it
  checks first is the bridge's set — allowlist file `[discord].channels`,
  `CORVIDINHO_DISCORD_ALLOW_CHANNELS` and `DISCORD_CHANNEL_IDS` — with deny
  lists winning.
- `docs/discord.md` (Files and images in replies, "Gates, in order"): the
  same channel set for `discord-send-file`, deny lists winning.
- README.md:60, docs/DISCORD-GO-LIVE.md:19/32, `.env.example` and `--help`
  already present `DISCORD_CHANNEL_IDS` as the channel allowlist; the fix
  makes them hold for the post plugin, so they are unchanged.
- No CHANGELOG version section (lands with the next 0.0.x release cut).
