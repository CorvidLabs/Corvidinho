# Lesson bundle — release-0-0-31-owner-only-channel-autocomplete-keystore-and-specsync-write-protection-audited-schedule-delete-per-user

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.31: owner-only channel autocomplete, keystore and .specsync/ write protection, audited /schedule delete, per-user thread sessions, failing-step verify feedback, paused schedules ping the owner, presence on every IDENTIFY, SpecSync lists specs/
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.31; version prints 0.0.31; CHANGELOG 0.0.31 extractable; STATUS rows

## Evidence

- Verification commit: `63a2ac17462a690e593fd144806a7ecf49e3a650`
- Base commit: `0940db343de30fdb4d79d83cfa44b95c5a247681`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.31: owner-only channel autocomplete, keystore and .specsync/ write protection, audited /schedule delete, per-user thread sessions, failing-step verify feedback, paused schedules ping the owner, presence on every IDENTIFY, SpecSync lists specs/

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.31, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-422` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.31; changelog helper extracts 0.0.31 exactly. |

## Where these lessons go

- `specs/cli/context.md`
