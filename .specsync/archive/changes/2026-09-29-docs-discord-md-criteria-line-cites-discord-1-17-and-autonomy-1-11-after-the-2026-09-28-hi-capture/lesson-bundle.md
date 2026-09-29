# Lesson bundle — docs-discord-md-criteria-line-cites-discord-1-17-and-autonomy-1-11-after-the-2026-09-28-hi-capture

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Docs/discord.md criteria line cites DISCORD-1..17 and AUTONOMY-1..11 after the 2026-09-28 hi capture
- **Kind**: Documentation
- **Paths**: docs/discord.md
- **Acceptance**: docs/discord.md's criteria line cites DISCORD-1..17 (the highest captured DISCORD-N) and AUTONOMY-1..11; tests/docs.operator-facts.test.ts passes.

## Evidence

- Verification commit: `742d2a155b3ec19c688f007c23297420378d120b`
- Base commit: `9bf2bebc354203debed24f6d7b67517d1a2021a7`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

The hi capture in this PR adds DISCORD-15..17 and AUTONOMY-8..11, so the one docs line that lists captured id ranges (checked by tests/docs.operator-facts.test.ts) now says DISCORD-1..17 and AUTONOMY-1..11. DISCORD-14 was never captured.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
