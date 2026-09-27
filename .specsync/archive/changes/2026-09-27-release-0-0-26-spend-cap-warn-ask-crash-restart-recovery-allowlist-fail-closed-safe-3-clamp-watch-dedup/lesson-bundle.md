# Lesson bundle — release-0-0-26-spend-cap-warn-ask-crash-restart-recovery-allowlist-fail-closed-safe-3-clamp-watch-dedup

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.26: spend cap warn/ask, crash + restart recovery, allowlist fail-closed, SAFE-3 clamp, WATCH dedup
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.26; version prints 0.0.26; CHANGELOG 0.0.26 extractable; STATUS rows

## Evidence

- Verification commit: `7909d58821256854441ad1710482811fb1bde048`
- Base commit: `3cdbb5c7cc469fe3d9fbaae991f58d69326da9dd`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.26: spend cap warn/ask, crash + restart recovery, allowlist fail-closed, SAFE-3 clamp, WATCH dedup

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.26, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-026` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.26; changelog helper extracts 0.0.26 exactly. |

## Where these lessons go

- `specs/cli/context.md`
