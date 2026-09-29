---
change: discord-outbound-posts-parse-no-mentions-from-model-text-so-untrusted-input-cannot-ping-roles-everyone-or-here-discord
artifact: research
---

# Research

- Discord's default for a message without `allowed_mentions` is to parse
  everyone/here/roles/users from content. Specifying
  `allowed_mentions: { parse: [] }` disables all content parsing; naming
  users in `users` still pings those ids without enabling parse.
- discord.js `Client` accepts a default `allowedMentions` applied when a
  payload omits the field; we still set it on every outbound call so a
  future path cannot forget it.
- `defangMassMentions` (zero-width space in `@everyone` / `@here`) is belt
  and suspenders for clients or logs that ignore `allowed_mentions`.
- Ask pings (REQ-discord-044) already passed `mentionUserIds`; this change
  keeps that list under `parse: []` and does not widen who may be pinged.
