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
  text is re-measured (after the scrub). Bun's `spyOn` on the `node:fs`
  namespace reaches the plugin's named `statSync` import, so a test can
  report a stale size deterministically.
- Discord needs the bot's own Attach Files permission to upload a file (else
  the API refuses the upload); the go-live invite list did not name it.
