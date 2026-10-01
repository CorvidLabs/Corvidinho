# Lesson bundle — release-0-0-38-spend-approve-cards-unknown-price-cards-stall-nudge-stop-button-cli-task-worktree-failed-runs-say-why

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.38: spend approve cards, unknown-price cards, stall nudge, stop button, CLI task worktree, failed runs say why
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.38; version prints 0.0.38; CHANGELOG 0.0.38 extractable; STATUS rows

## Evidence

- Verification commit: `ec80caef56ccc7565cea4092a5c6bc2478960c29`
- Base commit: `aeb2de3407acd0990897121ac68caf1553be0118`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.38: spend approve cards, unknown-price cards, stall nudge, stop button, CLI task worktree, failed runs say why

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.38, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-429` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.38; changelog helper extracts 0.0.38 exactly. |

## Where these lessons go

- `specs/cli/context.md`
