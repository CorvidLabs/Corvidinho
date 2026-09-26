# Lesson bundle — release-0-0-10-live-ndjson-stream-139-owner-record-owner-only-admin-138-141-safe-5-audit-trail-136-task-argv-fix-143

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.10: live NDJSON stream (#139), owner record + owner-only ADMIN (#138/#141), SAFE-5 audit trail (#136), --task argv fix (#143); package 0.0.10, CHANGELOG, STATUS
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.10; version prints 0.0.10; CHANGELOG 0.0.10 section with upgrade notes; STATUS rows

## Evidence

- Verification commit: `5a26bb8f7c4fa429140e9cb7f7c284a3ce855820`
- Base commit: `085997e28427678316dbc2d233c36f6695686d79`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Frequent verbose 0.0.x releases (standing order). Since the 0.0.9 notes, main gained #136 (SAFE-5 audit), #138/#141 (owner + owner-only ADMIN), #139 (NDJSON stream, protocol 2) and #143 (--task argv fix). Two of these need operator action on upgrade (owner config; bridge+binary restart together).

## From the change's design.md

# Design

Bump package.json to 0.0.10 (shared `src/version.ts` feeds CLI `version` and Discord presence). CHANGELOG 0.0.10 section with upgrade notes first. STATUS rows + roadmap. Version tests updated; changelog helper test proves `0.0.10` is extracted exactly (not `0.0.1`). The tag is pushed by a human (proxy blocks tag pushes here).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-016` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.10; changelog helper extracts the 0.0.10 section exactly and 0.0.9 still resolves. |

## Automated coverage

- `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/cli/context.md`
