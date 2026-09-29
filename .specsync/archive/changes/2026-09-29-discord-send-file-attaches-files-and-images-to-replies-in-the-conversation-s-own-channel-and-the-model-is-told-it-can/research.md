---
change: discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can
artifact: research
---

# Research

- Discord REST uploads: `POST /channels/{id}/messages` as multipart with
  `payload_json` (`content`, `allowed_mentions`, `attachments: [{ id: 0,
  filename }]`) and `files[0]`. A message with only an attachment needs no
  content. Oversize uploads answer HTTP 413 / JSON code 40005.
- Discord's default per-file limit is 8 MB for unboosted servers (boosts
  raise it); the API gives no per-guild "lower" value up front, so the plugin
  caps at 8 MB and reports a 413 / 40005 as the server's lower limit.
- Existing pieces reused: `sniffImageMediaType` (files-read image mode),
  `resolveProjectPath` / `realRoot` / `isInsideRoot` / `assertExistingFile`
  (symlink-following clamp), `isProtectedPath` / `isSecretPath` /
  `SECRET_GIT_EXCLUDE_PATHSPECS`, `gitRoot` / `runGit` / `scrubGitOutput`,
  `scrubSecrets` / `formatErrorLine`, `defangMassMentions`,
  `checkChannel` / `tryLoadAllowlist`, `verifyRequesterCanSend`, and
  `runPlugin`'s SAFE-1 / ROLES-CHAT / SAFE-5 gates.
- The bridge already sets the acting user per spawn
  (`CORVIDINHO_ACTING_DISCORD_USER_ID`, always overwritten); the reply
  channel follows the same pattern.
