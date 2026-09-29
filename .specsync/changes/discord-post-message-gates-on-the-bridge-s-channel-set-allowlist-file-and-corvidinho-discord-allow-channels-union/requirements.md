---
change: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
artifact: requirements
---

# Requirements

- ALLOW-3 (hi/allow.md) and DISCORD-5 (hi/discord.md): it only posts in
  channels Leif allowlisted — the same list the bridge listens on.
- REQ-discord-004: the channel allowlist is `DISCORD_CHANNEL_IDS` union the
  file / env channels (modified: `discord-post-message` gates on this union,
  deny first; see deltas/discord.md).
- REQ-plugins-009: the post target MUST pass the Discord channel allowlist
  (modified: that allowlist is the bridge's union; deny still wins; see
  deltas/plugins.md).
- REQ-plugins-006: a malformed / unreadable allowlist file still refuses.
- REQ-discord-476 / DISCORD-17: `discord-send-file` gates its conversation
  channel (a thread through its parent) on the channel allowlist first; that
  allowlist is REQ-discord-004's union too (named in the REQ-discord-004
  delta), so it can attach in every channel the bridge talks in.
- No new hi criteria are captured (none were confirmed for this fix).
