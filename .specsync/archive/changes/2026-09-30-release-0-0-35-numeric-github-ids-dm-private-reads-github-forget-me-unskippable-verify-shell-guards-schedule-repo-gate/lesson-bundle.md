# Lesson bundle — release-0-0-35-numeric-github-ids-dm-private-reads-github-forget-me-unskippable-verify-shell-guards-schedule-repo-gate

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.35: numeric GitHub ids, DM private reads, GitHub forget-me, unskippable verify, shell guards, schedule repo gate
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.35; version prints 0.0.35; CHANGELOG 0.0.35 extractable; STATUS rows

## Evidence

- Verification commit: `06979bc519af8d46f860c97dfb28777b456cd508`
- Base commit: `7697caf0f4ac4634c2cf2e1d3b848e11bd15c3b5`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.35: numeric GitHub ids, DM private reads, GitHub forget-me, unskippable verify, shell guards, schedule repo gate

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.35, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-426` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.35; changelog helper extracts 0.0.35 exactly. |

## Where these lessons go

- `specs/cli/context.md`
