# Lesson bundle — release-0-0-37-owner-worktree-shell-model-fallback-provider-spend-caps-specsync-changes-owner-schedules-stop-and-queue

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.37: owner worktree shell, model fallback, provider spend caps, SpecSync changes, owner schedules, stop and queue
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.37; version prints 0.0.37; CHANGELOG 0.0.37 extractable; STATUS rows

## Evidence

- Verification commit: `0f99ca7db9078746fd9c1ffb7c715f4ec1b15dfd`
- Base commit: `81ceb4a1423189b50ce25df34363b26b50426d1d`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.37: owner worktree shell, model fallback, provider spend caps, SpecSync changes, owner schedules, stop and queue

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.37, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-428` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.37; changelog helper extracts 0.0.37 exactly. |

## Where these lessons go

- `specs/cli/context.md`
