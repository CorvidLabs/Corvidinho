---
id: concurrent-audit-appends-from-several-processes-lose-no-safe-5-rows-regression-test-for-req-plugins-287-multi-process
state: archived
type: bug_fix
base_commit: 9cab0ec853d8b4b55acda7f1ff708a6b68a1a130
---

# Concurrent audit appends from several processes lose no SAFE-5 rows: regression test for REQ-plugins-287 multi-process acceptance (review follow-up for PR 211)

## Intent

Concurrent audit appends from several processes lose no SAFE-5 rows: regression test for REQ-plugins-287 multi-process acceptance (review follow-up for PR 211)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- Four bun processes each open the shared file DB, append one SAFE-5 audit row and close it, 40 times each, at the same time; every append succeeds, the audit_log holds all 160 rows and verifyAudit reports the chain ok. The same test loses rows (database is locked) on the pre-fix deferred transaction.

## No-spec Rationale

Not applicable
