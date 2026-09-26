# Lesson bundle — backfill-changelog-0-0-9-0-0-10-notes-owner-only-admin-upgrade-note-136-138-141-under-0-0-9-protocol-2-restart-note-139

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Backfill CHANGELOG 0.0.9/0.0.10 notes: owner-only ADMIN upgrade note + #136/#138/#141 under 0.0.9; protocol-2 restart note + #139/#143 under 0.0.10; STATUS rows
- **Kind**: Documentation
- **Paths**: CHANGELOG.md, STATUS.md, tests/update-helpers.test.ts
- **Acceptance**: 0.0.10 notes include the protocol-2 restart note, #139 and #143; 0.0.9 notes include the owner-only ADMIN upgrade note, #138/#141 and #136; changelog-helper tests assert both

## Evidence

- Verification commit: `623e8b81d4e347513b7fa941afe0137026a2753b`
- Base commit: `8747a9abb99c2322ea67c40da96fb60bc69172bc`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

The v0.0.9 and v0.0.10 tags were cut by a parallel worker from builds that already contained #136/#138/#141 (v0.0.9) and #139/#143 (v0.0.10), but their CHANGELOG sections did not mention them — including two operator-facing upgrade steps (set the owner before deploying owner-only ADMIN; restart bridge + watch + binary together for protocol 2). This backfills the notes so the updater's changelog extraction and readers see them.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
