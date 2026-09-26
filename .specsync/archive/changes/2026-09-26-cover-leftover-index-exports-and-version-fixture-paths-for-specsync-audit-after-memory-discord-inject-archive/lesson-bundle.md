# Lesson bundle — cover-leftover-index-exports-and-version-fixture-paths-for-specsync-audit-after-memory-discord-inject-archive

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover leftover index exports and version fixture paths for SpecSync audit after memory-discord-inject archive
- **Kind**: BugFix
- **Specs**: agent, discord, cli
- **Paths**: src/agent/index.ts, src/discord/index.ts, tests/update-helpers.test.ts, tests/version.test.ts
- **Acceptance**: src/agent/index.ts re-exports MEMORY_AGENT_SYSTEM_INSTRUCTIONS; src/discord/index.ts re-exports memory-inject helpers; tests/version.test.ts and tests/update-helpers.test.ts assert package 0.0.7 / changelog 0.0.7; covered for SpecSync change audit after memory-discord-inject archive; no new module AC

## Evidence

- Verification commit: `817d8139113f9af4896fa25240f02854128d04fe`
- Base commit: `b425f4ab09cc089c33f4914054a9183c68737040`
- Verified by: `specsync check --spec agent --spec cli --spec discord`

## From the change's context.md

# Context

After archiving memory-discord-inject, SpecSync change audit flagged leftover
meaningful paths not on an active change: agent/discord index re-exports and
version/changelog fixture bumps. Same cover-leftover pattern as files/search #81.

## From the change's design.md

# Design

No-spec-change cover workspace only. Paths are re-exports and version fixture
assertions already required by REQ-agent-010 / REQ-discord-023 / REQ-cli-014.

## From the change's testing.md

# Testing

- `bun test tests/version.test.ts tests/update-helpers.test.ts tests/discord.memory-inject.test.ts`
- `specsync change audit` reports no uncovered meaningful paths
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/agent/context.md`
- `specs/discord/context.md`
- `specs/cli/context.md`
