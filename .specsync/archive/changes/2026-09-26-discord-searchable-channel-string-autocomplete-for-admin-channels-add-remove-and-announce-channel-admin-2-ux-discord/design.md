---
change: discord-searchable-channel-string-autocomplete-for-admin-channels-add-remove-and-announce-channel-admin-2-ux-discord
artifact: design
---

# Design

- Choice `value` = channel snowflake (≤100); `name` = `#label (id)`.
- Rank: exact → prefix → substring → id; empty query lists up to 25.
- Add/announce: all GuildText from `guild.channels.cache`.
- Remove: intersect with `getAllowlistedChannelIds()` (live `config.channelIds`).
- Autocomplete deadline skip at 2500ms (Discord 3s limit).
- No persist/schema change; deny/last-channel guards unchanged.
