# Lesson bundle — discord-announce-slash-discord-announce-1-6-channel-picker-persist-bridge-live-announce-only-package-0-0-8-req-discord

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord /announce slash DISCORD-ANNOUNCE-1..6 CHANNEL picker persist bridge-live announce-only package 0.0.8 REQ-discord-024
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord, hi/discord.md, docs/discord.md, docs/BOX-UPDATE.md, STATUS.md, package.json, CHANGELOG.md, tests/discord.announce.test.ts, tests/discord.register-commands.test.ts, tests/version.test.ts, tests/update-helpers.test.ts, tests/discord.session-worktree.test.ts, .github/workflows/release.yml
- **Acceptance**: /announce channel|show with CHANNEL picker; ADMIN set/clear persists SQLite; show+/status; ClientReady bridge live only to announce channel; empty admin deny-all; package 0.0.8 eight slash; REQ-discord-024; tests+verify green

## Evidence

- Verification commit: `9a61b05b5d8e0cceb067030d6446c0b33b01a072`
- Base commit: `459f48215bb329d617a71d7e51e6faf4e1af2231`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# context

DISCORD-ANNOUNCE-1..6: `/announce` CHANNEL picker set/clear + show; persist `discord_announce_channel_id` in shared SQLite; `postAnnouncement` announce-only (never dogfood allowlist by default); ClientReady `bridge live vX.Y.Z`; ADMIN mutations; package **0.0.8** (main already at 0.0.7 MEMORY inject). REQ-discord-024 (023 is MEMORY inject).

## From the change's design.md

# design

DISCORD-ANNOUNCE-1..6: `/announce` CHANNEL picker set/clear + show; persist `discord_announce_channel_id` in shared SQLite; `postAnnouncement` announce-only (never dogfood allowlist by default); ClientReady `bridge live vX.Y.Z`; ADMIN mutations; package **0.0.8** (main already at 0.0.7 MEMORY inject). REQ-discord-024 (023 is MEMORY inject).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-009 | `tests/discord.announce.test.ts` + schedule/slash tests — eight-command set |
| REQ-discord-016 | `tests/discord.register-commands.test.ts` — eight bodies |
| REQ-discord-018 | `docs/discord.md` announce section + mermaid |
| REQ-discord-024 | `tests/discord.announce.test.ts` — set/clear/show, deny, persist, postAnnouncement, status; package 0.0.8 |

## Automated coverage

- `bun test`; `bunx tsc --noEmit`; `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
