# Lesson bundle — release-0-0-29-slash-asks-session-continuity-allowlisted-channel-gates-secret-path-hiding-schedule-run-recovery-schema

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.29: slash asks + session continuity, allowlisted-channel gates, secret-path hiding, schedule-run recovery (schema v10), clean CLI errors, doctor reads the allowlist file
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts, AGENTS.md
- **Acceptance**: package.json 0.0.29; version prints 0.0.29; CHANGELOG 0.0.29 extractable; STATUS rows

## Evidence

- Verification commit: `fa2640d46b0556970b79ea2740846220872c9f90`
- Base commit: `d0819cca081eccce8aee657f037ed0a44940f0b8`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.29: slash asks + session continuity, allowlisted-channel gates, secret-path hiding, schedule-run recovery (schema v10), clean CLI errors, doctor reads the allowlist file

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.29, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-420` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.29; changelog helper extracts 0.0.29 exactly. |

## Where these lessons go

- `specs/cli/context.md`
