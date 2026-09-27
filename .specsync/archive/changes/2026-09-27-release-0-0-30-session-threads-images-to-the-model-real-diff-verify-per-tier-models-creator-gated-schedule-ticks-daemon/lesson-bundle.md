# Lesson bundle — release-0-0-30-session-threads-images-to-the-model-real-diff-verify-per-tier-models-creator-gated-schedule-ticks-daemon

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.30: session threads, images to the model, real-diff verify, per-tier models, creator-gated schedule ticks + daemon asks reach Discord (schema v11), CI-strict spec-check, language runners, CI tags every version
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts, fledge.toml
- **Acceptance**: package.json 0.0.30; version prints 0.0.30; CHANGELOG 0.0.30 extractable; STATUS rows

## Evidence

- Verification commit: `db8f2b873f2fee578222388800d48a9ce62239a6`
- Base commit: `66ee70c4638346039333b8a63dc663c2984f7ed2`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Release 0.0.30: session threads, images to the model, real-diff verify, per-tier models, creator-gated schedule ticks + daemon asks reach Discord (schema v11), CI-strict spec-check, language runners, CI tags every version

## From the change's design.md

# Design

Version bump, CHANGELOG 0.0.30, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-421` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.30; changelog helper extracts 0.0.30 exactly. |

## Where these lessons go

- `specs/cli/context.md`
