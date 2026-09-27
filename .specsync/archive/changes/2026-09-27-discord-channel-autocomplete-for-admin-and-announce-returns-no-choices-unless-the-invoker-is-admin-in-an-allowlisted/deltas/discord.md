---
module: discord
change: discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted
---

# Delta — discord (channel autocomplete only for ADMIN in an allowlisted channel)

## Added

### REQUIREMENT REQ-discord-431

Channel autocomplete on the STRING `channel` options (`/admin channels add|remove`, `/announce channel`) SHALL list channels only for ADMIN invoking from an allowlisted channel (DISCORD-DENY-3 / ADMIN-4). The check SHALL be re-run on every autocomplete request, never trusted from registration, in the slash gate order: the interaction's channel passes the channel allowlist (`gateChannel`), the actor passes `gateActor` (deny users/roles win; a non-empty user/role allowlist applies), and `resolvePermissionLevel` with the live mute set is ADMIN (the configured owner; no owner means nobody, IDENTITY-3). Otherwise the gateway SHALL answer an empty choice list, so no channel name, id or allowlist entry reaches a non-admin. The gateway SHALL also answer an empty list when no gate is wired or the gate throws (fail closed). An allowed request SHALL keep today's choices: guild text channels for `add` and `/announce channel`, and the live allowlist for `remove`. Autocomplete SHALL NOT consume a rate-limit slot. No new slash command, option, env key or schema version.

Acceptance Criteria
- The owner in an allowlisted channel gets guild text channel choices for `/admin channels add` and `/announce channel`, and only the live allowlisted channels for `/admin channels remove`.
- A non-owner in an allowlisted channel gets `[]` for all three, including one on the user allowlist (STANDARD).
- The owner in a channel that is not allowlisted gets `[]`.
- The owner holding a deny-listed role gets `[]`, and so does a muted owner (live mute set, no restart).
- With no owner configured, every caller gets `[]`.
- `respondChannelAutocomplete` answers exactly once and answers `[]` when `mayAutocompleteChannels` is unset, returns false or throws. The gate receives `commandName`, `channelId`, `userId` and member `roleIds`.
- Fixture tests only; no live Discord token or network.
