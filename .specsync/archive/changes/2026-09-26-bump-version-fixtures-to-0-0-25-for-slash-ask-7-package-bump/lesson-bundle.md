# Lesson bundle — bump-version-fixtures-to-0-0-25-for-slash-ask-7-package-bump

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Bump version fixtures to 0.0.25 for slash ASK-7 package bump
- **Kind**: BugFix
- **Paths**: tests/update-helpers.test.ts, tests/version.test.ts
- **Acceptance**: tests/version.test.ts and tests/update-helpers.test.ts assert package 0.0.25 and extract CHANGELOG 0.0.25 section with /session /work ASK-7 bullets; bun test both files green.

## Evidence

- Verification commit: `169d015553cf75c2e669b2d1a11175da60c7c411`
- Base commit: `8a337299ee6b396473f43fb5ed8c81de14e025ff`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Slash ASK-7 archive tip bumped package to 0.0.25 and adapted version fixtures.
Spec Sync CI audit failed because those test paths were not covered by an active
change. No product/spec delta — cover the already-landed fixture bump.

## From the change's testing.md

# Testing

```bash
bun test tests/version.test.ts tests/update-helpers.test.ts
```

Evidence: package.json is 0.0.25; extract_changelog_section finds 0.0.25 with DISCORD-ASK-7 /session /work.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
