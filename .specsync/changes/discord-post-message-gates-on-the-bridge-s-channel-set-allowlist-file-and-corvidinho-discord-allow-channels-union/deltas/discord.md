---
module: discord
change: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
---

# Delta — discord (discord-post-message and discord-send-file use the bridge's channel union)

## Modified

### REQUIREMENT REQ-discord-004

The bridge SHALL load allowlists from file and env. It SHALL require a non-empty channel allowlist and SHALL fail to start if the channel list is empty.

When the allowlist file exists but cannot be read or parsed (REQ-plugins-006),
`loadBridgeConfig` SHALL return `code: "allowlist"` and the bridge SHALL NOT
start; it SHALL NOT fall back to env channels alone. Multi-line
`[discord]` arrays (`channels`, `users`, `deny_*`) SHALL load in full.
`/admin` (REQ-discord-043) SHALL read a multi-line `users` / `channels`
array in full and SHALL refuse (not rewrite) a file it cannot parse. It SHALL
find the lines to edit with the loader's own reader, so a `]` or `#` inside a
quoted item neither ends an array nor starts a comment, and a key it adds goes
after the closing `]` of any multi-line array. Before any write it SHALL
re-read the new text exactly as the loader will after a restart and SHALL
refuse, writing nothing, unless it loads, the edited list reads back as
intended and every other list and key (`[owner]` included) is unchanged — so
a file it rewrites always reloads with every existing entry and every other
list intact.

The agent's `discord-post-message` SHALL gate its target channel on this
same union, deny lists first (REQ-plugins-009), so a channel the bridge
listens in through `DISCORD_CHANNEL_IDS` alone can also be posted to.
`discord-send-file` SHALL gate the conversation channel the bridge set (a
thread through its parent, REQ-discord-476) on the same union, deny lists
first, so it can attach in every channel the bridge talks in.

Acceptance Criteria
- DISCORD_CHANNEL_IDS and/or file/env channels union; empty → empty_channels error.
- A malformed allowlist file → `allowlist` error; the bridge does not start.
- A multi-line `deny_channels` loads and refuses its channel.
- `/admin users add` on a file with a multi-line `users` array keeps the existing entries, and the reloaded file keeps `deny_users` and `[github].deny_repos`.
- `/admin users add` on a file whose `[discord]` has only a multi-line `channels` array (LF and CRLF), and `/admin channels add` after a multi-line `deny_users`, put the new key after the closing `]`; the file reloads with every list intact.
- A `]` or `#` inside a quoted item survives an `/admin` rewrite; the comment on the edited key's first line is kept.
- A rewrite that would not reload as intended (an entry the one-line writer cannot quote) is refused and the file is left byte-for-byte unchanged.
- `discord-post-message` to a channel listed only in `DISCORD_CHANNEL_IDS` passes the channel gate (dry run exit 0); a deny on that channel still refuses (exit 3).
- `discord-send-file` in a conversation channel listed only in `DISCORD_CHANNEL_IDS`, or a thread whose parent is, attaches; a channel in no list is refused (not allowlisted) and a deny on that channel still refuses (is denied).
