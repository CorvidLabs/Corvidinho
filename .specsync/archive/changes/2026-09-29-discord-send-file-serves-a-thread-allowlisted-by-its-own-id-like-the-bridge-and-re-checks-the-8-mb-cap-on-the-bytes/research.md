---
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
artifact: research
---

# Research

- `src/discord/message-router.ts` `ownChannelAllowlisted` →
  `src/discord/permissions.ts` `isMonitoredConversation(thread, parent,
  cfg)`: admitted when the thread or its parent is allowlisted and neither is
  on `deny_channels`. The bridge's `cfg` is `loadDiscordConfig`'s
  `mergeChannelIds(allowlist, env)` copy (allowlist ∪ `DISCORD_CHANNEL_IDS`).
- `plugins/discord/send-file.ts` on `main` (after #272 / #276):
  `isChannelDenied(thread) ? checkChannel(thread) : checkChannel(parent ||
  thread)` — a self-allowlisted thread under an unlisted parent is refused;
  a denied parent already refused (via `checkChannel(parent)`).
- `fileAttachment`: `statSync(real).size` then `readFileSync(real)`; only
  text is re-measured (after the scrub), the whole file is read into memory
  first, and the read follows links, so a swap after the path checks is
  read. Bun's `spyOn` on the `node:fs` namespace reaches the plugin's named
  imports (`statSync`, `fstatSync`, `openSync`, `readSync`), so a test can
  report a stale size, count the bytes read, or swap the file at the first
  `stat` / `open` of the checked path, deterministically.
- `resolveProjectPath` returns the realpath of an existing file, so the
  checked path has no link in it: `O_NOFOLLOW` refuses a link swapped in at
  the last component (`ELOOP`), and `/proc/self/fd/<fd>` names the file the
  descriptor really holds (a folder on the path swapped for a link shows
  there).
- Discord needs the bot's own Attach Files permission to upload a file (else
  the API refuses the upload); the go-live invite list did not name it.
