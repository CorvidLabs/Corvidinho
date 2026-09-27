# Lesson bundle — discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord channel autocomplete for /admin and /announce returns no choices unless the invoker is ADMIN in an allowlisted channel
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/gateway.ts, src/discord/bridge.ts, tests/discord.channel-autocomplete.test.ts, docs/discord.md, specs/discord/discord.spec.md
- **Acceptance**: Every channel autocomplete request (/admin channels add|remove, /announce channel) responds with an empty choice list unless the invoker is ADMIN in an allowlisted channel: the channel passes the slash channel allowlist gate, the actor passes the actor gate (deny users/roles win, user/role allowlist applies), and resolvePermissionLevel with the live mute set is ADMIN (the configured owner). Non-owners, a muted or deny-role owner, any caller outside an allowlisted channel, a bridge with no owner, and a gateway with no gate wired all get []. The owner in an allowlisted channel keeps today's choices (guild text channels for add/announce; the live allowlist for remove). Regression tests in tests/discord.channel-autocomplete.test.ts fail on main and pass with the fix; tsc --noEmit and bun test green.

## Evidence

- Verification commit: `b41d32dd9f3551a124f06f4fa52fb7636c88d59d`
- Base commit: `fbaa84b7cda1bf2b462baea44cad20ef93e0df4f`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

- Scoping found that channel autocomplete on `/admin channels add|remove` and
  `/announce channel` has no permission or channel check. `gateway.ts` sends
  every autocomplete interaction to `respondChannelAutocomplete`, which builds
  choices for anyone. No slash command sets `default_member_permissions`, so
  every guild member can trigger it.
- Effect on `origin/main` (fbaa84b): a non-owner typing into `/admin channels
  remove` gets the allowlisted channel names and ids. In `channels add` or
  `/announce channel` they get every guild text channel the bot can see. This
  also happens from a channel that is not allowlisted.
- Captured HI (`hi/discord.md`, `hi/admin.md`):
  - **DISCORD-DENY-3**: "Non-admins get zero response (no DM, no public
    message, no reaction). … never leak allowlist guidance to non-admins."
  - **ADMIN-4**: "Every admin-shaped command re-checks permission at handler
    time (DISCORD-7); registration alone is never enough, and empty
    owner/admin lists mean nobody is ADMIN."
- Out of scope: open PR #232 (the actor gate and mute/rate limit for ask
  button presses) and open PR #233 (SAFE-3 shell clamp). Neither touches
  autocomplete.

## From the change's design.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-431` | `tests/discord.channel-autocomplete.test.ts` › "owner in an allowlisted channel keeps today's choices" | Owner in the allowlisted channel gets all guild text channels for `channels add` and `/announce channel`, only the live allowlist for `channels remove`, and query matching still works. |
| `REQ-discord-431` | … › "a non-owner in an allowlisted channel gets no choices (no allowlist leak)" | Non-owner gets `[]` for add, remove and announce, with and without a query. |
| `REQ-discord-431` | … › "a non-owner on the user allowlist is still not ADMIN" | A user-allowlisted non-owner (STANDARD) gets `[]`. |
| `REQ-discord-431` | … › "the owner outside an allowlisted channel gets no choices" | Owner in a channel that is not allowlisted gets `[]`. |
| `REQ-discord-431` | … › "a muted owner or an owner holding a deny-listed role gets no choices" | A deny-role owner gets `[]`. The unmuted owner still gets choices. After `muteUser(owner)` all three commands give `[]` (live mute set). |
| `REQ-discord-431` | … › "no owner configured: nobody gets choices (IDENTITY-3 / ADMIN-4)" | With no owner, every caller gets `[]`. |
| `REQ-discord-431` | … › "the gateway fails closed: no gate wired, a false gate or a throwing gate" | No gate, a false gate or a throwing gate gives `[]` (exactly one `respond`). The gate receives `{commandName, channelId, userId, roleIds}`. A true gate gives today's choices. |

## Automated coverage

- `bun test tests/discord.channel-autocomplete.test.ts`: 16 pass on the
  branch.
- Fail-on-main proof. `src/discord/gateway.ts` and `src/discord/bridge.ts`
  were swapped for `origin/main`'s copies and then restored:
  - (a) As-is, the file fails to load (`respondChannelAutocomplete` is not
    exported): 0 pass, 1 fail.
  - (b) With only `export` added to main's function: 10 pass, 6 fail. Every
    gate test fails; the owner-keeps-choices test passes, as expected.
- `bunx tsc --noEmit`, full `bun test`, `specsync check --require-coverage
  100` and `fledge lanes run verify --non-interactive` are green.

## Where these lessons go

- `specs/discord/context.md`
