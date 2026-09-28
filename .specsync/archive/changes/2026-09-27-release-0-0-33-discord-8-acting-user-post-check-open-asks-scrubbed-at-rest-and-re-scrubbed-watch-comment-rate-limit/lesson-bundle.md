# Lesson bundle — release-0-0-33-discord-8-acting-user-post-check-open-asks-scrubbed-at-rest-and-re-scrubbed-watch-comment-rate-limit

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.33: DISCORD-8 acting-user post check, open asks scrubbed at rest and re-scrubbed, watch comment rate-limit backoff
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.33; version prints 0.0.33; CHANGELOG 0.0.33 extractable; STATUS rows

## Evidence

- Verification commit: `4a8806760d333f86f8b3c6da3bb6e5d2fdad05c9`
- Base commit: `a4069596b4f4e0278cdb179d74cff2927261d9aa`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.33: DISCORD-8 acting-user post check, open asks scrubbed at rest and re-scrubbed, watch comment rate-limit backoff

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.33, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-424` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.33; changelog helper extracts 0.0.33 exactly. |

## Where these lessons go

- `specs/cli/context.md`
