---
id: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
state: implementing
type: bug_fix
base_commit: 310861f81c5fb0314447109b959b8f37fb323578
---

# Discord-post-message gates on the bridge's channel set (allowlist file and CORVIDINHO_DISCORD_ALLOW_CHANNELS union DISCORD_CHANNEL_IDS), so a channel allowlisted only through DISCORD_CHANNEL_IDS can be posted to; deny lists still win

## Intent

discord-post-message gates on the bridge's channel set (allowlist file and CORVIDINHO_DISCORD_ALLOW_CHANNELS union DISCORD_CHANNEL_IDS), so a channel allowlisted only through DISCORD_CHANNEL_IDS can be posted to; deny lists still win

## Affected Canonical Specs

- `plugins`
- `discord`

## Acceptance Criteria

- discord-post-message gates its --channel on the same channel set as the bridge and daemon (mergeChannelIds: allowlist file [discord].channels + CORVIDINHO_DISCORD_ALLOW_CHANNELS union DISCORD_CHANNEL_IDS), so with no allowlist file, CORVIDINHO_DISCORD_ALLOW_CHANNELS unset and DISCORD_CHANNEL_IDS=111 a dry-run post to 111 succeeds (exit 0) and a post to a channel in no list is still refused (exit 3, not allowlisted); CORVIDINHO_DISCORD_DENY_CHANNELS=111 on top still refuses the post to 111 with exit 3 (deny wins); a malformed allowlist file still refuses (fail closed); the DISCORD_CHANNEL_IDS-only regression test fails on the base and passes after; discord-send-file gates the conversation channel the bridge set (a thread through its parent) on the same union, so a channel listed only in DISCORD_CHANNEL_IDS attaches, a channel in no list is refused and a deny still wins; its DISCORD_CHANNEL_IDS-only test fails on the base and passes after

## No-spec Rationale

Not applicable
