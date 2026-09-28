---
change: discord-button-pick-resume-injects-the-presser-s-display-name-and-username-like-a-chat-message-identity-4
artifact: design
---

# Design

`src/discord/gateway.ts`:

- `ComponentInteraction` gains optional `userDisplayName` and
  `userUsername` (same names and meaning as `SlashInteraction`).
- New exported `componentActorNames(interaction)` with the fixture-friendly
  `ComponentActorSource` type (`user` id / username / globalName /
  displayName, optional `member` displayName / nickname). It resolves the
  display name in the same order the slash adapter uses (member display,
  member nickname, user global name, user display), trims it, and trims the
  username; a blank or missing value is `undefined`, never a made-up label.
- `adaptComponent` spreads `componentActorNames(interaction)` into the
  `ComponentInteraction` it builds; its parameter type is intersected with
  `ComponentActorSource`.

`src/discord/bridge.ts` `onComponent` pick path passes
`displayName: interaction.userDisplayName` and
`username: interaction.userUsername` to `enrichPromptWithIdentity`, as the
chat path does with the message author. The presser is always the session's
user there (a press by anyone else is refused before the resume), so the
names describe the acting user. `resolveActingDisplayLabel` is unchanged:
the owner map display still wins for the owner.

Names come from the press itself, not from anything stored with the session,
so a renamed user is shown with their current name and no table or column is
added. No new slash command, env var or config key; the SQLite schema is
untouched. The slash adapter is not refactored onto the helper (no behaviour
change wanted there in this slice).
