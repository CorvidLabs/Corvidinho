---
change: discord-button-pick-resume-injects-the-presser-s-display-name-and-username-like-a-chat-message-identity-4
artifact: testing
---

# Testing

Fixture tests only, no Discord token or network. `tests/discord.identity-pick.test.ts`:

- **Bridge, through `startBridge` with a fake gateway and a recording
  agent** (owner configured with display `Leif`): the first run returns a
  clarify ask with two options; the same user then presses the pick button
  and the second run's prompt is checked.
  - A non-owner's pick with `userDisplayName: "Ada Lovelace"` has
    `display_name: Ada Lovelace` and no owner role line.
  - A non-owner's pick with only `userUsername: "ada"` has
    `display_name: ada`.
  - The owner's pick with other Discord names has `display_name: Leif` and
    `role: owner (ADMIN)`, never the Discord names.
  - A pick with no names has the id and no `display_name` line.
- **`componentActorNames`**: member display wins, then nickname, then
  global name, then user display; username trimmed; blank or missing names
  are `undefined`.
- **Live gateway wiring**: `createLiveGateway` with the real `login` and
  the socket connect stubbed out (as in `tests/discord.presence.test.ts`);
  a button press emitted as `InteractionCreate` reaches `onComponent` with
  `userDisplayName` from the member display and `userUsername`, and with
  neither when the press carries no names.

## Before and after

- `main`'s `src/discord/bridge.ts` with the branch `gateway.ts`: 4 pass,
  2 fail. The non-owner display-name and username tests fail: the resumed
  prompt's identity block has `discord_user_id` and no `display_name`.
- `main`'s `bridge.ts` and `gateway.ts`: the file fails to load
  (`componentActorNames` is not exported).
- The branch with the `...componentActorNames(interaction)` spread removed
  from `adaptComponent`: 7 pass, 1 fail (the live gateway guild press has no
  `userDisplayName`).
- Branch: 8 pass, 0 fail.

Also run: `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100` and
`fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-446` | `tests/discord.identity-pick.test.ts` | A non-owner's button-pick resume carries the presser's Discord display name, or username (both fail on `main`: no `display_name` line); the owner's pick keeps the owner map display and role line; a pick with no names injects the id only; `componentActorNames` resolves member display → nickname → global name → user display and the username, trimmed, blank as undefined; a press through the live gateway's InteractionCreate listener carries the names to `onComponent`. |
