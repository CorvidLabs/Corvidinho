---
module: plugins
change: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
---

# Delta — plugins (discord-post-message gates on the bridge's channel set)

## Modified

### REQUIREMENT REQ-plugins-009

The system SHALL register `discord-post-message` as a **dangerous** plugin (externally visible write). Non-interactive runs SHALL deny unless allowlisted (SAFE-1). Channel target MUST pass Discord channel allowlist (DISCORD-5 / ALLOW-3).

That channel allowlist SHALL be the same set the bridge and daemon gate on
(REQ-discord-004, `mergeChannelIds`): the allowlist file
`[discord].channels` plus `CORVIDINHO_DISCORD_ALLOW_CHANNELS`, union
`DISCORD_CHANNEL_IDS`. So a channel allowlisted only through
`DISCORD_CHANNEL_IDS` SHALL pass the gate. Deny lists SHALL still win: a
channel in `CORVIDINHO_DISCORD_DENY_CHANNELS` or the file's
`deny_channels` SHALL be refused even when it is also in
`DISCORD_CHANNEL_IDS`. A channel in no list SHALL still be refused, and a
malformed or unreadable allowlist file SHALL still refuse (fail closed,
REQ-plugins-006). No env var, flag, config key or command is added.

Acceptance Criteria
- `plugins list` shows `discord-post-message` with dangerous=true.
- Non-interactive without allowlist → deny (exit 2).
- Missing/empty channel allowlist or non-allowlisted channel → not authorized.
- No allowlist file, `CORVIDINHO_DISCORD_ALLOW_CHANNELS` unset, `DISCORD_CHANNEL_IDS=111`, dry run: a post to `111` succeeds (exit 0); a post to a channel in no list is refused (exit 3, not allowlisted).
- The same with `CORVIDINHO_DISCORD_DENY_CHANNELS=111` added: the post to `111` is refused (exit 3, denied).
