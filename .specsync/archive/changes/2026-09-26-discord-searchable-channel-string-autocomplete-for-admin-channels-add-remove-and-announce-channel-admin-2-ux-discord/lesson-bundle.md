# Lesson bundle — discord-searchable-channel-string-autocomplete-for-admin-channels-add-remove-and-announce-channel-admin-2-ux-discord

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord searchable channel STRING+autocomplete for /admin channels add|remove and /announce channel (ADMIN-2 UX / DISCORD-ANNOUNCE-2 amend); replace limited native CHANNEL picker; package 0.0.16
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord, tests, docs/discord.md, hi/admin.md, hi/discord.md, package.json, CHANGELOG.md, STATUS.md
- **Acceptance**: STRING+autocomplete on /admin channels add|remove and /announce channel matches guild text channels by case-insensitive name (emoji/unicode ok) or snowflake, returns ≤25 ranked choices; remove may scope to live allowlist; ADMIN-4 re-check unchanged; persist paths unchanged; package 0.0.16; fixture tests; dogfood by typing channel name letters

## Evidence

- Verification commit: `8b5c7fa9c350d79d8b4e067b8e0f2dc4c5fcabe8`
- Base commit: `8a1cdd4fe4cb49bab490a1dcbad8f0d07c372e44`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Leif (2026-09-26): Discord’s native CHANNEL option picker on `/admin channels add`
only shows a limited subset in his guild, has no useful search, and typing a
channel snowflake fails. Channels with custom fonts/emojis in names are hard to
find. Same picker is used by `/announce channel` (DISCORD-ANNOUNCE-2).

Steal: corvid-agent autocomplete handler patterns (≤25 choices, 2.5s deadline,
substring filter). Corvidinho already flattens slash options and persists
allowlist via admin-allowlist.ts — keep that path; only change option type +
gateway autocomplete.

After this change was drafted, main shipped unrelated work as package **0.0.16** (#171). The searchable-channel package bump on this branch is therefore **0.0.17** (CHANGELOG/package.json); SpecSync change id text still says 0.0.16 from the approved definition.

## From the change's design.md

# Design

- Choice `value` = channel snowflake (≤100); `name` = `#label (id)`.
- Rank: exact → prefix → substring → id; empty query lists up to 25.
- Add/announce: all GuildText from `guild.channels.cache`.
- Remove: intersect with `getAllowlistedChannelIds()` (live `config.channelIds`).
- Autocomplete deadline skip at 2500ms (Discord 3s limit).
- No persist/schema change; deny/last-channel guards unchanged.

## From the change's testing.md

# Testing

Fixture-only; no live Discord token.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| REQ-discord-043 | `tests/discord.admin-slash.test.ts` (STRING+autocomplete body; ADMIN-4 re-check; add/remove persist); `tests/discord.channel-autocomplete.test.ts` (name/emoji/id match, ≤25 rank, allowlist scope) |
| REQ-discord-009 | `tests/discord.announce.test.ts` (announce channel STRING+autocomplete body + handler snowflake resolve); `tests/discord.channel-autocomplete.test.ts` (shared matcher) |

## Commands

- `bun test tests/discord.channel-autocomplete.test.ts tests/discord.admin-slash.test.ts tests/discord.announce.test.ts`
- `fledge lanes run verify`

## Where these lessons go

- `specs/discord/context.md`
