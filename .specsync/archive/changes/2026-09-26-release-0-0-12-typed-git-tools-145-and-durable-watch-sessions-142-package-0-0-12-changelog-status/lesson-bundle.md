# Lesson bundle — release-0-0-12-typed-git-tools-145-and-durable-watch-sessions-142-package-0-0-12-changelog-status

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.12: typed git tools (#145) and durable WATCH sessions (#142); package 0.0.12, CHANGELOG, STATUS
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.12; version prints 0.0.12; CHANGELOG 0.0.12 section extractable by the updater; STATUS rows

## Evidence

- Verification commit: `177e038f96ce6032a14734d6b0d1620e8f5a790f`
- Base commit: `b08bd5d9c4cad02ed6a2c03ad0343465052976e2`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Frequent verbose 0.0.x releases (standing order). Since v0.0.11 (#151), main gained #145 (typed git tools) and #142 (durable WATCH sessions, schema v6).

## From the change's design.md

# Design

Bump package.json to 0.0.12 (shared src/version.ts feeds CLI version and Discord presence). CHANGELOG 0.0.12 with short first bullets (the bridge-live announce posts up to 5 CHANGELOG bullets, DISCORD-ANNOUNCE-4). STATUS rows. Version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-016` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.12; the updater changelog helper extracts the 0.0.12 section exactly. |

## Automated coverage

- `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/cli/context.md`
