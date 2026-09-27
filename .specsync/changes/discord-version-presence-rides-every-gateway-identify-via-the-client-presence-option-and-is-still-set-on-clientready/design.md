---
change: discord-version-presence-rides-every-gateway-identify-via-the-client-presence-option-and-is-still-set-on-clientready
artifact: design
---

# Design

`src/discord/presence.ts` gains `buildVersionPresenceData(version)` and its
type `VersionPresenceData`: `{ status: "online", activities: [the existing
buildVersionPresenceActivity(version)] }`, a fresh object per call because
discord.js mutates what it is given (`ClientPresence` assigns `user` onto
the options object; `_parse` may rewrite activities).

`createLiveGateway` passes `presence: buildVersionPresenceData(presenceVersion)`
in the Client options, so discord.js puts the version into the IDENTIFY
payload at login and reuses it for every re-identify. The `ClientReady`
handler keeps calling `setPresence`, now with `buildVersionPresenceData`
(same status and activity as before); its try/catch and log line are
unchanged. `ActivityType` is no longer destructured: the helper's type 4 is
`ActivityType.Custom`.

No new slash command, env var, config key, table or column. The SQLite
schema is untouched. `/status` and the version source are unchanged.
