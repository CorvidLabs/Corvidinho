---
id: cover-specsync-audit-paths-for-discord-deny-polish-leftovers-index-exports-discord-go-live-link-admin-reauth-and-rate
state: approved
type: bug_fix
base_commit: 5c4dc52158e5480b1efdf99dbab7891c0ba9bce8
---

# Cover SpecSync audit paths for Discord deny polish leftovers: index exports, DISCORD-GO-LIVE link, admin-reauth and rate-mute deny asserts

## Intent

Cover SpecSync audit paths for Discord deny polish leftovers: index exports, DISCORD-GO-LIVE link, admin-reauth and rate-mute deny asserts

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- CI SpecSync change audit passes: the four leftover paths (docs/DISCORD-GO-LIVE.md, src/discord/index.ts, tests/discord.admin-reauth.test.ts, tests/discord.rate-mute.test.ts) are covered by this active change; behavior already verified under archived DENY-1..3 change; no new canonical REQ

## No-spec Rationale

Cover leftover deny-polish paths (exports, go-live link, admin-reauth+rate-mute deny asserts) already shipped under archived DENY-1..3 change; no new canonical REQ text
