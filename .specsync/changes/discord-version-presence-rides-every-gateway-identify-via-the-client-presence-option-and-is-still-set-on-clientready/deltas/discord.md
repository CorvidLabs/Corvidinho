---
module: discord
change: discord-version-presence-rides-every-gateway-identify-via-the-client-presence-option-and-is-still-set-on-clientready
---

# Delta — discord (the version presence rides every gateway IDENTIFY)

## Modified

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

The live discord.js Client SHALL also be constructed with the same version
presence as its `presence` option, so the presence discord.js copies into the
gateway IDENTIFY payload at login carries the version Custom Status on the
first IDENTIFY and on every non-resumable re-identify (invalid or expired
session), where `ClientReady` does not fire again. Both uses SHALL build the
presence from one helper (`buildVersionPresenceData`) as a fresh object per
call.

Acceptance Criteria
- Presence activity state/name uses shared VERSION (e.g. `v0.0.3`), not a hardcoded bridge constant.
- Custom type (4) preferred with `state` holding the short version string.
- ClientReady / restart path sets presence; failure to set presence SHALL NOT abort slash registration or the bridge.
- Slash registration bodies and allowlists unchanged.
- Fixture test covers `buildVersionPresenceActivity` / format helper without a live token.
- The IDENTIFY presence discord.js builds at login (`options.ws.presence`, sent as `d.presence` on every IDENTIFY) has status `online` and exactly one activity: type 4, name `Custom Status`, state `v<version>`; it is never an empty activity list.
- ClientReady still calls `setPresence` with the same status and activity; a throwing `setPresence` is logged and the ready handler still records the bot user id and calls `onReady`.
- No new slash command, env var, config key or allowlist change.
- Regression tests in `tests/discord.presence.test.ts` run the real discord.js `login` with only the socket connect stubbed (no token, no network); the IDENTIFY test fails on `main` and passes after.
