---
hi: 1
families: [OPS]
owner: leif
issue_hints: [68]
---

# Ops

## Intent

Corvidinho's local SQLite store (memory, sessions, schedules) is copied every night to a place I set, so losing the box does not lose what it knows. A restore is proven by a regular test rather than assumed to work, and a failed backup or restore test is something I hear about, not something I discover later.

Confirmed by Leif in the 2026-09-28 interview (#68): the place is a local directory I configure, the snapshot is a consistent SQLite online backup with rotating copies, and the restore test runs weekly into a temporary directory.

## Criteria

- **OPS-1**  A nightly backup goes to a place I choose, and I'm told if it fails.
- **OPS-2**  A backup can be restored, and the restore is tested regularly.
