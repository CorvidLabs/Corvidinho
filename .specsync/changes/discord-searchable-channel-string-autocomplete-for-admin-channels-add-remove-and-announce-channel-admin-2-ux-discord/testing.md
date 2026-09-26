---
change: discord-searchable-channel-string-autocomplete-for-admin-channels-add-remove-and-announce-channel-admin-2-ux-discord
artifact: testing
---

# Testing

- `tests/discord.channel-autocomplete.test.ts` — ranking, emoji names, allowlist
  scope, 25-cap, slash body shape.
- Existing `discord.admin-slash` / `discord.announce` / version / update-helpers
  updated for STRING+autocomplete and 0.0.16.
- `fledge lanes run verify` green locally.
