---
change: discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted
artifact: design
---

# Design

- **Gateway (`gateway.ts`).** `GatewayHandlers` gains an optional
  `mayAutocompleteChannels(actor: AutocompleteActor) => boolean`. The actor
  is `commandName`, `channelId`, `userId` and member `roleIds`.
  `respondChannelAutocomplete` is now exported so fixtures can drive it. It
  asks the gate first. If the gate is unset, returns false or throws
  (logged), it answers `respond([])` once and builds nothing. Otherwise it
  builds choices as before (text channels; `remove` scoped to the live
  allowlist).
- **Role ids.** A small `memberRoleIds(member)` helper reads role ids from a
  cached GuildMember (`roles.cache`) or a raw API member (`roles: string[]`).
  It is shared with `adaptChatInput`, which inlined the same logic before.
- **Bridge (`bridge.ts`).** It wires `mayAutocompleteChannels` in the slash
  gate order against the live config: `gateChannel(channelId,
  allowlist).ok` && `gateActor({userId, roleIds, allowlist, owner}).ok` &&
  `resolvePermissionLevel({..., owner, mutedUsers}) >= ADMIN`. The same
  `config.allowlist` and `mutedUsers` objects that `/admin` and `/mute`
  change in place are used, so changes apply without a restart.
- **Rate limit.** Autocomplete does not consume a rate-limit slot. It fires on
  every keystroke and runs nothing, and counting it would lock the owner out
  of the command they are typing. Mute still applies through
  `resolvePermissionLevel`.
- **Channel id.** The check uses the interaction's own `channelId`, the same
  id the slash dispatcher gates. Inside a thread that is the thread id, so
  autocomplete agrees with whether the slash command itself would run there.
- Most conservative reading of the captured text: every autocomplete is
  gated. Today only these three options use autocomplete. No new command,
  option, env key or schema change.
