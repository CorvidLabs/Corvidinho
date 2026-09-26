---
change: discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src
artifact: plan
---

# Plan

1. Add `formatPresenceVersionString` in `src/version.ts` and pure `buildVersionPresenceActivity` in `src/discord/presence.ts`.
2. On `ClientReady` in `createLiveGateway`, call `setPresence` with Custom activity; log the short string; pass package version from bridge.
3. Spec delta REQ-discord-017; HI DISCORD-12; STATUS note; fixture test.
4. `specsync change check` → review → ship → PR → merge when verify+SpecSync green; restart live bridge.
