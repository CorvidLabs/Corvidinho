# Lesson bundle — discord-button-pick-resume-injects-the-presser-s-display-name-and-username-like-a-chat-message-identity-4

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord button-pick resume injects the presser's display name and username like a chat message (IDENTITY-4)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/gateway.ts, src/discord/bridge.ts, tests/discord.identity-pick.test.ts, specs/discord/discord.spec.md, specs/discord/testing.md, docs/discord.md
- **Acceptance**: An ask button pick resume injects the presser's Discord identity like a chat message: a non-owner's resume prompt carries display_name from the press's Discord display name, or its username when there is none; the owner's pick keeps the owner map display and the owner role line; a pick with no names known injects the Discord id only, never an invented name. The live gateway sets ComponentInteraction userDisplayName (member display, nickname, global name, user display) and userUsername, trimmed, blank as undefined. No new slash command, env var, config key, table or column; SQLite schema unchanged. Regression tests fail on main and pass after.

## Evidence

- Verification commit: `af257c71d8652e87ae491a23e0e24ce66f7a3fa9`
- Base commit: `1c7b6ced470e0ed87e4c854f2663111713af3fa7`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

IDENTITY-4 (hi/identity.md): "Discord chat injects acting user Discord id
plus display name from Discord and the owner map when known; never invent
names like Kyn; memory stays scoped to that acting user".

On `origin/main` (1c7b6ce) the chat path in `src/discord/bridge.ts` passes
`msg.authorDisplayName` and `msg.authorUsername` to
`enrichPromptWithIdentity`, and `/session start` and `/work` pass the slash
`userDisplayName` / `userUsername`. The ask button pick path (the resume
that runs the agent after a DISCORD-ASK choice) passes only `{ userId, owner }`,
and `ComponentInteraction` in `src/discord/gateway.ts` has no name fields at
all: `adaptComponent` copies only `interaction.user.id`. A non-owner's
resumed prompt therefore carries the snowflake with no `display_name`, so
the model has no Discord name for the person it is talking to on that turn,
though it had one on the turn before. The owner is not affected (the owner
map display wins and the owner is passed).

Repro on main: @mention as a non-owner, get a Choose ask, pick an option;
the resumed prompt's `[Corvidinho acting Discord user …]` block has
`discord_user_id` and no `display_name` line.

Scope: this slice only. Open PRs #232 (ask-button actor gate + mute/rate,
which also edits `adaptComponent` and `ComponentInteraction` for role ids)
and #233 (SAFE-3 clamp) are left alone; the new fields and helper sit away
from #232's lines to keep the two PRs mergeable in either order.

## From the change's design.md

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

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
