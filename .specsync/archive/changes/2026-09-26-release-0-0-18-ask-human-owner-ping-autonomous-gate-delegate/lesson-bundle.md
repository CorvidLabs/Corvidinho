# Lesson bundle — release-0-0-18-ask-human-owner-ping-autonomous-gate-delegate

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.18: ask-human + owner ping, autonomous gate + delegate
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.18; version prints 0.0.18; CHANGELOG 0.0.18 extractable; STATUS rows

## Evidence

- Verification commit: `aa9422b2f8353c0f70396798e715e0df267b4de3`
- Base commit: `c69e0e2fefdf11d506f55c528035d422973e4f1a`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.18: ask-human + owner ping, autonomous gate + delegate

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.18, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-019` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.18; changelog helper extracts 0.0.18 exactly. |

## Where these lessons go

- `specs/cli/context.md`
