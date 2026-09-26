# Lesson bundle — cover-leftover-memory-acl-fixture-and-acting-user-wire-paths-for-specsync-audit-after-memory-sqlite-acl-archive-session

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover leftover MEMORY ACL fixture and acting-user wire paths for SpecSync audit after memory-sqlite-acl archive (session/work handlers, slash-types, scheduler actingUser, memory tests, version 0.0.4 fixtures)
- **Kind**: BugFix
- **Specs**: discord, plugins, cli
- **Paths**: src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/discord/slash-types.ts, src/scheduler/service.ts, tests/discord.presence.test.ts, tests/memory.plugins.test.ts, tests/memory.store.test.ts, tests/update-helpers.test.ts, tests/version.test.ts
- **Acceptance**: SpecSync change audit covers leftover MEMORY ship paths (session/work handlers, slash-types, scheduler actingUser env, memory*.test.ts, version/update-helpers 0.0.4 fixtures); no new HI; fledge verify green

## Evidence

- Verification commit: `4187bd8ce2d1a2855b86e898867b992ef0250ed1`
- Base commit: `e5a926e64ece9bd428c718f0872de7a6c58ba617`
- Verified by: `specsync check --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

After MEMORY #41/#59 archive tip, Spec Sync CI `change audit` reported uncovered
paths touched by the MEMORY ship (acting-user wire in session/work/scheduler,
slash-types MemoryStore field, memory fixture tests, 0.0.4 version fixtures).
This cover change owns those exact paths with `--no-spec-change` — REQ-discord-021 /
REQ-plugins-010 / REQ-cli-011 already archived on the prior change.

## From the change's design.md

# Design

No new design. Path ownership only for SpecSync audit. Behavior already shipped
in memory-sqlite-acl product tip.

## From the change's testing.md

# Testing

- `bun test tests/memory.store.test.ts tests/memory.plugins.test.ts tests/version.test.ts tests/update-helpers.test.ts`
- `specsync change audit` clean for PR tip
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
- `specs/plugins/context.md`
- `specs/cli/context.md`
