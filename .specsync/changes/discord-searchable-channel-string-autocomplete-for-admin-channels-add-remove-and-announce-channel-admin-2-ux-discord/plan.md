---
change: discord-searchable-channel-string-autocomplete-for-admin-channels-add-remove-and-announce-channel-admin-2-ux-discord
artifact: plan
---

# Plan

1. Pure `channel-autocomplete.ts` (match/rank/resolve) + fixture tests.
2. Slash bodies: CHANNEL → STRING `autocomplete: true` for admin add/remove and announce.
3. Gateway `InteractionCreate` autocomplete using guild text cache; remove uses live allowlist ids from bridge.
4. Handlers resolve snowflake/`<#id>`; keep ADMIN re-check + persist.
5. Amend HI DISCORD-ANNOUNCE-2 + ADMIN-2 note; specs/docs/CHANGELOG; bump 0.0.17.
