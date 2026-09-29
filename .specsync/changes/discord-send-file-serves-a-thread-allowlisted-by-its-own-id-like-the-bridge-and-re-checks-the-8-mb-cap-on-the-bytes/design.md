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
- `fileAttachment` reads through an internal `readCheckedFile(root, real,
  raw)`: one `openSync(real, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)` (`real` is
  already resolved, so a link there was swapped in: `ELOOP` refuses, SAFE-2);
  `fstatSync` must show a regular file; the descriptor's own path
  (`readlinkSync("/proc/self/fd/<fd>")`, Linux; a trailing " (deleted)" is
  judged both ways) must still be inside the project and pass `refusedPath`,
  which catches a folder on the path swapped for a link; the fstat size is
  capped, then at most `DISCORD_UPLOAD_MAX_BYTES + 1` bytes are read in
  chunks, so a file that grew after the fstat is refused with `tooLarge`
  (exit 2) without being read whole. The descriptor is always closed. The
  type sniff / scrub run on those bytes, as before.
- Not changed: `discord-post-message` (model-chosen channel, its own gate);
  WATCH spawns still inherit `CORVIDINHO_DISCORD_REPLY_*` (REQ-watch-008,
  #67; a WATCH run cannot attach anyway: no acting user, ROLES-CHAT-3).
- Leftover risk: a hard link to `.env` placed inside the project under an
  innocent name is not detectable by path (same inode, no symlink to
  follow); SAFE-6 scrubbing of text still applies.
