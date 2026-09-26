---
module: discord
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
---

# Delta — discord (bridge refuses a malformed allowlist file)

## Modified

### REQUIREMENT REQ-discord-004

The bridge SHALL load allowlists from file and env. It SHALL require a non-empty channel allowlist and SHALL fail to start if the channel list is empty.

When the allowlist file exists but cannot be read or parsed (REQ-plugins-006),
`loadBridgeConfig` SHALL return `code: "allowlist"` and the bridge SHALL NOT
start; it SHALL NOT fall back to env channels alone. Multi-line
`[discord]` arrays (`channels`, `users`, `deny_*`) SHALL load in full.
`/admin` (REQ-discord-043) SHALL read a multi-line `users` / `channels`
array in full, SHALL refuse (not rewrite) a file it cannot parse, and a file
it rewrites SHALL reload with every existing entry and every other list
intact.

Acceptance Criteria
- DISCORD_CHANNEL_IDS and/or file/env channels union; empty → empty_channels error.
- A malformed allowlist file → `allowlist` error; the bridge does not start.
- A multi-line `deny_channels` loads and refuses its channel.
- `/admin users add` on a file with a multi-line `users` array keeps the existing entries, and the reloaded file keeps `deny_users` and `[github].deny_repos`.
