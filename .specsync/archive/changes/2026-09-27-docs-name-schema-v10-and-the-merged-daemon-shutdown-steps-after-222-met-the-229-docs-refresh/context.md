---
change: docs-name-schema-v10-and-the-merged-daemon-shutdown-steps-after-222-met-the-229-docs-refresh
artifact: context
---

# Context

#229 refreshed the operator docs on a main with schema v9. #222 (this PR) adds schema v10 (`schedule_runs.runner`) and a 3 s worktree cleanup grace on daemon shutdown. Merging main after #229 left docs/DAEMON.md conflicting and docs/BOX-UPDATE.md naming v9, which the docs-facts test catches.
