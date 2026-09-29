---
change: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
artifact: design
---

# Design

- In `discordPostMessage.handler`, after `tryLoadAllowlist` succeeds, gate on
  `checkChannel(channelId, { ...loaded.config.discord, channels:
  mergeChannelIds(loaded.config, process.env) })` — the same shape as
  `daemonGate` and the bridge's `cfgAllow`.
- Deny lists are untouched and `checkChannel` reads them first, so a channel
  in `CORVIDINHO_DISCORD_DENY_CHANNELS` / `deny_channels` is still refused even
  when it is in `DISCORD_CHANNEL_IDS`.
- Reuse only: no new helper, env var, flag, config key, table or command.
  `discord-send-file` is not changed (conservative; pending Leif).
