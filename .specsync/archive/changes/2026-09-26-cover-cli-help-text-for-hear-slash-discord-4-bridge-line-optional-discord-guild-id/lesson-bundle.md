# Lesson bundle — cover-cli-help-text-for-hear-slash-discord-4-bridge-line-optional-discord-guild-id

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover CLI help text for HEAR slash (DISCORD-4 bridge line + optional DISCORD_GUILD_ID)
- **Kind**: Documentation
- **Paths**: src/cli.ts
- **Acceptance**: CLI --help mentions DISCORD-1/2/3/4/5 for discord bridge and documents optional DISCORD_GUILD_ID for guild slash registration; no cli module AC change

## Evidence

- Verification commit: `b9c1eb61800bb1dc7795fdfaa30146d229205cc3`
- Base commit: `a19c1df2339268e66fefa91b604d91707cfa6739`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Companion cover for `src/cli.ts` help text edited while shipping HEAR slash
(#11 / DISCORD-4). Documents updated bridge criteria list and optional
`DISCORD_GUILD_ID` for guild-scoped slash registration. No cli module AC change.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
