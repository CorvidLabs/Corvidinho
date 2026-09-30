# Lesson bundle — release-0-0-34-declared-people-and-roles-person-and-project-memory-with-forget-me-github-memory-and-ranked-recall

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.34: declared people and roles, person and project memory with forget-me, GitHub memory and ranked recall, condensed chats kept 30 days and resumed after the TTL (schema v13), answer footer and fence-safe 2000-char splits, nightly backup, discord-send-file, private Answer form, injection guards, W12 sweep
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.34; version prints 0.0.34; CHANGELOG 0.0.34 extractable; STATUS rows

## Evidence

- Verification commit: `341859fd8c9dddea99668ecce1bfd86766cf57b0`
- Base commit: `20a0f5841256109511825c70604b552b3ca4b062`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.34: declared people and roles, person and project memory with forget-me, GitHub memory and ranked recall, condensed chats kept 30 days and resumed after the TTL (schema v13), answer footer and fence-safe 2000-char splits, nightly backup, discord-send-file, private Answer form, injection guards, W12 sweep

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.34, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-425` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.34; changelog helper extracts 0.0.34 exactly. |

## Where these lessons go

- `specs/cli/context.md`
