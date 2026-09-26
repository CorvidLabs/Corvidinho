# Lesson bundle — release-0-0-21-security-correctness-sweep-council-tool-admin-pr-diff-edges-operator-guide

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.21: security + correctness sweep, council tool, admin/pr-diff edges, operator guide
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.21; version prints 0.0.21; CHANGELOG 0.0.21 extractable; STATUS rows

## Evidence

- Verification commit: `517fb61323b76b55d18ad1faae9188fa0b9ea55b`
- Base commit: `aef2cde685e9e9be6f0dc1c4311a916e33981afc`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.21: security + correctness sweep, council tool, admin/pr-diff edges, operator guide

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.21, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-021` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.21; changelog helper extracts 0.0.21 exactly. |

## Where these lessons go

- `specs/cli/context.md`
