---
change: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
artifact: context
---

# Context

Found by the 2026-09-28 QA audit (finding
`post-message-ignores-discord-channel-ids`, kind e2e-break) and confirmed as
Wave 0 W12 bug-sweep work in Leif's 2026-09-28 interview. No new hi criteria:
this restores already captured behaviour — ALLOW-3 / DISCORD-5 channel
allowlists, REQ-discord-004 (the channel allowlist is `DISCORD_CHANNEL_IDS`
union the file / env channels) and REQ-plugins-009 (the post target MUST pass
the Discord channel allowlist).

- `plugins/discord/index.ts` gated on `tryLoadAllowlist()` +
  `checkChannel(channelId, loaded.config)` only. `loadAllowlist` reads
  channels from the file and `CORVIDINHO_DISCORD_ALLOW_CHANNELS`, never
  `DISCORD_CHANNEL_IDS`.
- The bridge (`loadBridgeConfig`, `src/discord/config.ts`) and the daemon
  (`daemonGate`, `src/daemon/daemon.ts`) gate on `mergeChannelIds(allowlist,
  env)`, which adds `DISCORD_CHANNEL_IDS`. README, docs/DISCORD-GO-LIVE.md,
  `.env.example` and `--help` present `DISCORD_CHANNEL_IDS` as the channel
  allowlist.
- Bridge-spawned runs inherit `process.env`, so they carry
  `DISCORD_CHANNEL_IDS`, but the plugin ignored it.

Repro on base `310861f` (HOME an empty dir, no allowlist file):
`DISCORD_TOKEN=x DISCORD_CHANNEL_IDS=111111111111111111
CORVIDINHO_DISCORD_DRY_RUN=1 bun src/cli.ts plugins run discord-post-message
-- --channel 111111111111111111 hi` printed `not authorized: Discord channel
allowlist empty` and exited 3; the same with
`CORVIDINHO_DISCORD_ALLOW_CHANNELS` exited 0.

Out of scope: `discord-send-file` (`plugins/discord/send-file.ts`, DISCORD-17)
has the same `checkChannel(…, loaded.config)` shape; it is left unchanged here
(fails closed) and flagged for Leif.
