# Lesson bundle — cover-fixture-tests-for-guild-slash-overwrite-clear-globals-and-discord-register-commands-cli

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover fixture tests for guild slash overwrite + clear-globals and discord register-commands CLI
- **Kind**: Documentation
- **Paths**: tests/discord.register-commands.test.ts, tests/discord.bridge.cli.test.ts
- **Acceptance**: tests/discord.register-commands.test.ts and tests/discord.bridge.cli.test.ts covered by this documentation cover change; bun test green; no module AC change

## Evidence

- Verification commit: `1f915e90db622d02a683b3ccacb6e65a7a31fcb6`
- Base commit: `4c2b3a52279d8b76bb0ecc3701357e21c4927d5c`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Cover change for SpecSync path audit: `tests/discord.register-commands.test.ts`
and `tests/discord.bridge.cli.test.ts` were added with the guild PUT + clear-globals
fix but were outside the parent change's `--path` list. No new acceptance criteria.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
