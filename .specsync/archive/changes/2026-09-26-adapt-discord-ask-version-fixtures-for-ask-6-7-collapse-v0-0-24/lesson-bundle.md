# Lesson bundle — adapt-discord-ask-version-fixtures-for-ask-6-7-collapse-v0-0-24

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Adapt Discord ask/version fixtures for ASK-6/7 collapse (v0.0.24)
- **Kind**: BugFix
- **Paths**: tests/discord.ask-ping.test.ts, tests/discord.session-worktree.test.ts, tests/discord.thin-ack.test.ts, tests/update-helpers.test.ts, tests/version.test.ts
- **Acceptance**: ask-ping/thin-ack/soft-TTL/version fixtures assert collapse (contentEdits) and package 0.0.24; bun test green

## Evidence

- Verification commit: `d48016b11b477263db2dc613f23746ccd16c96d8`
- Base commit: `883a3f546cebdaa7a9fe26bde8155df80f7edcfb`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context
Fixture adaptations required after DISCORD-ASK-6/7 collapsed thinking→stub→answer. Companion to the main ask UX change; no new HI.

## From the change's design.md

# Design
Tests read `outbound.contentEdits` instead of separate `replies` when collapse succeeds; package/version expectations are 0.0.24.

## From the change's testing.md

# Testing
## Commands
`bun test tests/discord.ask-ping.test.ts tests/discord.thin-ack.test.ts tests/discord.session-worktree.test.ts tests/version.test.ts tests/update-helpers.test.ts`

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
