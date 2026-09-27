# Lesson bundle — release-0-0-32-allowlisted-tools-reach-the-model-fledge-core-builtins-choose-asks-on-work-and-session-start-open-asks

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.32: allowlisted tools reach the model, Fledge core builtins, Choose asks on work and session start, open asks kept per askId, role-refusal note, --project, doctor and init name project files
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.32; version prints 0.0.32; CHANGELOG 0.0.32 extractable; STATUS rows

## Evidence

- Verification commit: `5105cf8585683031c36e92158337d720645b44fb`
- Base commit: `19ec0e5bb09f48def1c420c4a970a79e0b3203b5`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.32: allowlisted tools reach the model, Fledge core builtins, Choose asks on work and session start, open asks kept per askId, role-refusal note, --project, doctor and init name project files

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.32, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-423` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.32; changelog helper extracts 0.0.32 exactly. |

## Where these lessons go

- `specs/cli/context.md`
