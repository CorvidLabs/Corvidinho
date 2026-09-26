# Lesson bundle — release-0-0-23-stop-means-stop-process-trees-safe-3-cd-clamp-scrub-before-clip-github-gate-reads-allowlist-file

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.23: stop means stop (process trees), SAFE-3 cd clamp, scrub before clip, GitHub gate reads allowlist file
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.23; version prints 0.0.23; CHANGELOG 0.0.23 extractable; STATUS rows

## Evidence

- Verification commit: `a38e57843079701dc59c74655e5513184cf9a56a`
- Base commit: `a422b6a7a63908263bfa5f9ed418093287a7077b`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.23: stop means stop (process trees), SAFE-3 cd clamp, scrub before clip, GitHub gate reads allowlist file

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.23, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-023` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.23; changelog helper extracts 0.0.23 exactly. |

## Where these lessons go

- `specs/cli/context.md`
