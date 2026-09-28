---
id: docs-name-schema-v10-and-the-merged-daemon-shutdown-steps-after-222-met-the-229-docs-refresh
state: archived
type: documentation
base_commit: c2dcbc8bc284cf2de74f5c782f7c175f67c7cedb
---

# Docs name schema v10 and the merged daemon shutdown steps after #222 met the #229 docs refresh

## Intent

docs name schema v10 and the merged daemon shutdown steps after #222 met the #229 docs refresh

## Affected Canonical Specs

- None

## Acceptance Criteria

- docs/BOX-UPDATE.md names schema v10 (SCHEMA_VERSION in src/store/db.ts) and tests/docs.operator-facts.test.ts passes; docs/DAEMON.md shutdown steps list both the process-group kill with daemon.abandoned and the 3 s worktree cleanup grace.

## No-spec Rationale

Docs-only merge follow-up: #222 added schema v10 (schedule_runs.runner) and a 3 s worktree grace; #229's refreshed docs predate it. No spec or source change.
