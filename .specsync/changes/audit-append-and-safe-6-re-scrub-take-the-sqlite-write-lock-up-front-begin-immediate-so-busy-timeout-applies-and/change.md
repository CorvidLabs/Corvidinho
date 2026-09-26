---
id: audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and
state: draft
type: bug_fix
base_commit: 05b269af23ea2be9e9c41966f6cf9ee41dfeac02
---

# Audit append and SAFE-6 re-scrub take the SQLite write lock up front (BEGIN IMMEDIATE) so busy_timeout applies and concurrent writers wait instead of failing with database is locked (SAFE-5, SAFE-6)

## Intent

Audit append and SAFE-6 re-scrub take the SQLite write lock up front (BEGIN IMMEDIATE) so busy_timeout applies and concurrent writers wait instead of failing with database is locked (SAFE-5, SAFE-6)

## Affected Canonical Specs

- `plugins`
- `discord`

## Acceptance Criteria

- While another process holds the shared DB write lock and then commits, appendAudit (SAFE-5 dangerous-run rows) and rescrubDatabase (SAFE-6 re-scrub) wait under busy_timeout and succeed instead of failing at once with database is locked; the waiting audit row links to the other writer's row and the chain verifies

## No-spec Rationale

Not applicable
