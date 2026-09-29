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
- `discord-send-file` (`plugins/discord/send-file.ts`) had the same
  `checkChannel(…, loaded.config)` shape and gets the same merge on
  `parent || channelId`. It only ever attaches in the conversation channel the
  bridge set for the run, which the bridge accepted on this same union, so the
  merge adds no channel the bridge does not already talk in; before it, every
  attach in a `DISCORD_CHANNEL_IDS`-only deployment was refused ("allowlist
  empty"), against DISCORD-17 ("never says it can't send them").
- Reuse only: no new helper, env var, flag, config key, table or command.
