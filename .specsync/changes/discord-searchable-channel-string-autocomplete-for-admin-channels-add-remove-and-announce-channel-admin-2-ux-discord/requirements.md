---
change: discord-searchable-channel-string-autocomplete-for-admin-channels-add-remove-and-announce-channel-admin-2-ux-discord
artifact: requirements
---

# Requirements

- REQ-discord-043: channel options for `/admin channels add|remove` are STRING +
  autocomplete (≤25), match guild text by case-insensitive name substring
  (emoji/unicode ok) or snowflake; remove may scope to live allowlist; ADMIN-4
  re-check unchanged.
- REQ-discord-009 / DISCORD-ANNOUNCE-2 (amended): `/announce channel` uses the
  same searchable STRING + autocomplete (no native CHANNEL picker).
- Package 0.0.17; slash re-register after deploy.
