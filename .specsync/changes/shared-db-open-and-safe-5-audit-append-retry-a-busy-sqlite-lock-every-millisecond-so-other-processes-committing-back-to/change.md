---
id: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
state: approved
type: bug_fix
base_commit: 507d97b75b08ebe86c5e0c5ab19322ea82d683cb
---

# Shared DB open and SAFE-5 audit append retry a busy SQLite lock every millisecond, so other processes committing back to back cannot pass them over for the whole busy_timeout and lose audit rows

## Intent

Shared DB open and SAFE-5 audit append retry a busy SQLite lock every millisecond, so other processes committing back to back cannot pass them over for the whole busy_timeout and lose audit rows

## Affected Canonical Specs

- `plugins`
- `discord`

## Acceptance Criteria

- While another process holds the shared DB write lock for about a second then frees it for 50 ms and keeps it past busy_timeout appendAudit takes the lock while it is free and the chain verifies (before the fix it failed with database is locked)
- While another process holds the shared DB file exclusively for about a second then frees it for 50 ms and keeps it past busy_timeout openCorvidinhoDb opens while it is free and keeps busy_timeout 5000 and foreign_keys on (before the fix it failed with database is locked)
- Four processes that each open the shared DB and append one SAFE-5 row 40 times at once lose no rows and keep one chain when every fsync takes 10 ms longer (before the fix 5 of 20 runs lost a row)

## No-spec Rationale

Not applicable
