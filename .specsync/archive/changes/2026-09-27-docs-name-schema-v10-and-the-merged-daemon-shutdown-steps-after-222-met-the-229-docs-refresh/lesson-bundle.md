# Lesson bundle — docs-name-schema-v10-and-the-merged-daemon-shutdown-steps-after-222-met-the-229-docs-refresh

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Docs name schema v10 and the merged daemon shutdown steps after #222 met the #229 docs refresh
- **Kind**: Documentation
- **Paths**: docs/BOX-UPDATE.md, docs/DAEMON.md
- **Acceptance**: docs/BOX-UPDATE.md names schema v10 (SCHEMA_VERSION in src/store/db.ts) and tests/docs.operator-facts.test.ts passes; docs/DAEMON.md shutdown steps list both the process-group kill with daemon.abandoned and the 3 s worktree cleanup grace.

## Evidence

- Verification commit: `ebb1706c60f285e95ba76b7dc9c1e01500464e02`
- Base commit: `c2dcbc8bc284cf2de74f5c782f7c175f67c7cedb`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

#229 refreshed the operator docs on a main with schema v9. #222 (this PR) adds schema v10 (`schedule_runs.runner`) and a 3 s worktree cleanup grace on daemon shutdown. Merging main after #229 left docs/DAEMON.md conflicting and docs/BOX-UPDATE.md naming v9, which the docs-facts test catches.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
