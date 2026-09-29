---
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
artifact: design
---

# Design

- `send-file.ts` gets an internal `conversationChannelRefusal(channel,
  parent, allowlist, env)`: it builds the bridge's gate config
  (`mergeChannelIds`, as #272) and asks `isMonitoredConversation` — the
  router's own function — so the plugin and the router cannot drift. On a
  refusal it returns the `checkChannel` error for the deny-listed id (thread
  first, then parent), else for `parent || channel` ("not allowlisted"), so
  the existing error texts are kept. Not exported: no Public API change.
- `fileAttachment` re-checks `data.byteLength` against
  `DISCORD_UPLOAD_MAX_BYTES` right after `readFileSync`, before the type
  sniff / scrub, with the same `tooLarge` refusal (exit 2).
- Not changed: `discord-post-message` (model-chosen channel, its own gate);
  WATCH spawns still inherit `CORVIDINHO_DISCORD_REPLY_*` (REQ-watch-008,
  #67; a WATCH run cannot attach anyway: no acting user, ROLES-CHAT-3).
- Leftover risk: a hard link to `.env` placed inside the project under an
  innocent name is not detectable by path (same inode, no symlink to
  follow); SAFE-6 scrubbing of text still applies.
