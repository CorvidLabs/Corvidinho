---
change: discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src
artifact: design
---

# Design

- `formatPresenceVersionString(version)` → `vX.Y.Z` (prefix `v` if missing).
- `buildVersionPresenceActivity(version)` → `{ name: "Custom Status", state: "vX.Y.Z", type: 4 }` (ActivityType.Custom).
- `createLiveGateway(config, handlers, { version })` on ClientReady: `client.user.setPresence({ status: "online", activities: [...] })`; warn-and-continue on failure.
- Bridge default factory passes `version` from package / opts.
- Fallback not needed in code path: discord.js v14 supports Custom + state for bots; Playing/Watching only if we later observe Custom not displaying (out of scope unless live proves otherwise).
- No slash or allowlist changes.
