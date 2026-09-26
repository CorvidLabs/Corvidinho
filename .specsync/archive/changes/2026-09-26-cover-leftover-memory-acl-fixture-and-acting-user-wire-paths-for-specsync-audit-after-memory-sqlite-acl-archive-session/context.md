---
change: cover-leftover-memory-acl-fixture-and-acting-user-wire-paths-for-specsync-audit-after-memory-sqlite-acl-archive-session
artifact: context
---

# Context

After MEMORY #41/#59 archive tip, Spec Sync CI `change audit` reported uncovered
paths touched by the MEMORY ship (acting-user wire in session/work/scheduler,
slash-types MemoryStore field, memory fixture tests, 0.0.4 version fixtures).
This cover change owns those exact paths with `--no-spec-change` — REQ-discord-021 /
REQ-plugins-010 / REQ-cli-011 already archived on the prior change.
