---
module: discord
change: discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src
---

# Delta — discord (presence version DISCORD-12)

## Added

### REQUIREMENT REQ-discord-017

On Discord gateway `ClientReady` (including after bridge restart), the live
gateway SHALL set the bot presence/activity to a short version string derived
from the shared package version (`src/version.ts` / `package.json` — the same
source as `/status`), so operators can see which Corvidinho build is live under
the bot name (DISCORD-12). The system SHOULD prefer Custom Status
(`ActivityType.Custom` / type 4) with state text like `v0.0.3`. The string SHALL
stay short; the system SHALL NOT invent extra status chrome, new slash commands,
or allowlist changes. Fixture tests SHALL cover the presence payload builder
without a live Discord token.

Acceptance Criteria
- Presence activity state/name uses shared VERSION (e.g. `v0.0.3`), not a hardcoded bridge constant.
- Custom type (4) preferred with `state` holding the short version string.
- ClientReady / restart path sets presence; failure to set presence SHALL NOT abort slash registration or the bridge.
- Slash registration bodies and allowlists unchanged.
- Fixture test covers `buildVersionPresenceActivity` / format helper without a live token.
