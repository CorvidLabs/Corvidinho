---
id: discord-searchable-channel-string-autocomplete-for-admin-channels-add-remove-and-announce-channel-admin-2-ux-discord
state: archived
type: feature
base_commit: 8a1cdd4fe4cb49bab490a1dcbad8f0d07c372e44
---

# Discord searchable channel STRING+autocomplete for /admin channels add|remove and /announce channel (ADMIN-2 UX / DISCORD-ANNOUNCE-2 amend); replace limited native CHANNEL picker; package 0.0.16

## Intent

Discord searchable channel STRING+autocomplete for /admin channels add|remove and /announce channel (ADMIN-2 UX / DISCORD-ANNOUNCE-2 amend); replace limited native CHANNEL picker; package 0.0.16

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- STRING+autocomplete on /admin channels add|remove and /announce channel matches guild text channels by case-insensitive name (emoji/unicode ok) or snowflake, returns ≤25 ranked choices; remove may scope to live allowlist; ADMIN-4 re-check unchanged; persist paths unchanged; package 0.0.16; fixture tests; dogfood by typing channel name letters

## No-spec Rationale

Not applicable
