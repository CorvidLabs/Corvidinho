# Lesson bundle — backfill-0-0-17-notes-with-166-work-draft-pr-owner-only-and-169-instructions-from-head-that-shipped-in-the-v0-0-17

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Backfill 0.0.17 notes with #166 (/work draft PR, owner-only) and #169 (instructions from HEAD) that shipped in the v0.0.17 build
- **Kind**: Documentation
- **Paths**: CHANGELOG.md, STATUS.md, tests/update-helpers.test.ts
- **Acceptance**: 0.0.17 section lists #166 and #169; helper test asserts it

## Evidence

- Verification commit: `21078ade5c4b190ddfa0ff4dff58458c32239627`
- Base commit: `545dbd288c6d3ad669d5570bbf9f4dca6edb1bf8`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

A parallel worker cut v0.0.17 (#170) on top of #166 and #169 without listing them; this backfills the notes and the allowlist ops step.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
