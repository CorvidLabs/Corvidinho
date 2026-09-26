# Lesson bundle — release-0-0-20-security-correctness-sweep-council-tool-admin-pr-diff-edges-operator-guide

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.20: security + correctness sweep, council tool, admin/pr-diff edges, operator guide
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.20; version prints 0.0.20; CHANGELOG 0.0.20 extractable; STATUS rows

## Evidence

- Verification commit: `f570d61bbf8ca1b13b3f5e6a9444957fe27641f8`
- Base commit: `7af2cec07739d7af3cf3ab6e77855707cdaa1e68`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.20: security + correctness sweep, council tool, admin/pr-diff edges, operator guide

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.20, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-020` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.20; changelog helper extracts 0.0.20 exactly. |

## Where these lessons go

- `specs/cli/context.md`
