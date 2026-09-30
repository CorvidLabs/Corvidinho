# Lesson bundle — release-0-0-36-approval-cards-and-codes-must-ask-gate-owner-only-spend-no-default-model-tests-ran-verify-schedule-asks

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.36: approval cards and codes, must-ask gate, owner-only spend, no default model, tests-ran verify, schedule asks
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.36; version prints 0.0.36; CHANGELOG 0.0.36 extractable; STATUS rows

## Evidence

- Verification commit: `9e7566c8402e3526e8c8a017cb41cb560ebcf950`
- Base commit: `507d97b75b08ebe86c5e0c5ab19322ea82d683cb`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.36: approval cards and codes, must-ask gate, owner-only spend, no default model, tests-ran verify, schedule asks

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.36, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-427` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.36; changelog helper extracts 0.0.36 exactly. |

## Where these lessons go

- `specs/cli/context.md`
