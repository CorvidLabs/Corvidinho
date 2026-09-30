---
id: shared-db-open-takes-the-write-lock-up-front-so-processes-that-open-a-new-file-or-one-with-a-re-scrub-due-at-once-take
state: verifying
type: bug_fix
base_commit: 24f70ecdca39ffa74e1645185baf7cc9882982ca
---

# Shared DB open takes the write lock up front, so processes that open a new file or one with a re-scrub due at once take turns instead of failing part way

## Intent

Shared DB open takes the write lock up front, so processes that open a new file or one with a re-scrub due at once take turns instead of failing part way

## Affected Canonical Specs

- `discord`
- `plugins`

## Acceptance Criteria

- Six processes that open a new shared DB file at once and append one SAFE-5 row each all get in and the file ends at the current schema version with the chain verified (before the fix five of them failed with no such table)
- Four processes that open a shared DB file with a re-scrub due at once and append one row each all get in and the re-scrub redacts the stored secret and records the rules version with the chain verified (before the fix three of them failed with database is locked after 5 s)
- The brief-release open and append tests and the concurrent appenders test still pass also with every fsync 20 ms longer

## No-spec Rationale

Not applicable
