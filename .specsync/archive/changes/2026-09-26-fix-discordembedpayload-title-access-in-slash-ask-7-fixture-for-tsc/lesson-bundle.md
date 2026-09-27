# Lesson bundle — fix-discordembedpayload-title-access-in-slash-ask-7-fixture-for-tsc

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Fix DiscordEmbedPayload title access in slash ASK-7 fixture for tsc
- **Kind**: BugFix
- **Paths**: tests/discord.slash-ask7.test.ts
- **Acceptance**: tsc --noEmit clean; slash-ask7 tests still pass without referencing DiscordEmbedPayload.title.

## Evidence

- Verification commit: `30290e1c70b0b100a1ba7d72c659150bd1722e6f`
- Base commit: `d40400015fdcb4ae5b7ccfc19a2a8fc7b20a7cff`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

CI smoke typecheck failed: fixture used `e.title` but `DiscordEmbedPayload` has only description/color/footer.

## From the change's testing.md

# Testing

```bash
bunx tsc --noEmit
bun test tests/discord.slash-ask7.test.ts
```

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
