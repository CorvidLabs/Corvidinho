---
change: discord-searchable-channel-string-autocomplete-for-admin-channels-add-remove-and-announce-channel-admin-2-ux-discord
artifact: context
---

# Context

Leif (2026-09-26): Discord’s native CHANNEL option picker on `/admin channels add`
only shows a limited subset in his guild, has no useful search, and typing a
channel snowflake fails. Channels with custom fonts/emojis in names are hard to
find. Same picker is used by `/announce channel` (DISCORD-ANNOUNCE-2).

Steal: corvid-agent autocomplete handler patterns (≤25 choices, 2.5s deadline,
substring filter). Corvidinho already flattens slash options and persists
allowlist via admin-allowlist.ts — keep that path; only change option type +
gateway autocomplete.

After this change was drafted, main shipped unrelated work as package **0.0.16** (#171). The searchable-channel package bump on this branch is therefore **0.0.17** (CHANGELOG/package.json); SpecSync change id text still says 0.0.16 from the approved definition.
