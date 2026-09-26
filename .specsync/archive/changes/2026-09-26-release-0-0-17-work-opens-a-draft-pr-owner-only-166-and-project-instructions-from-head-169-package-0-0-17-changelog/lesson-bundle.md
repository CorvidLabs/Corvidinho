# Lesson bundle — release-0-0-17-work-opens-a-draft-pr-owner-only-166-and-project-instructions-from-head-169-package-0-0-17-changelog

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.17: /work opens a draft PR owner-only (#166) and project instructions from HEAD (#169); package 0.0.17, CHANGELOG, STATUS
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.17; version prints 0.0.17; CHANGELOG 0.0.17 extractable; STATUS rows

## Evidence

- Verification commit: `33822813e0aafae4f60f88335ab3df397c414066`
- Base commit: `12c7a6e4ff84e1ca4d49b61cba217ab833af7132`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Since v0.0.16 (#171): #166 (/work draft PR) and #169 (instructions from HEAD).

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.17 with allowlist ops note, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-018` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.17; changelog helper extracts 0.0.17 exactly. |

## Where these lessons go

- `specs/cli/context.md`
