# Lesson bundle — concurrent-audit-appends-from-several-processes-lose-no-safe-5-rows-regression-test-for-req-plugins-287-multi-process

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Concurrent audit appends from several processes lose no SAFE-5 rows: regression test for REQ-plugins-287 multi-process acceptance (review follow-up for PR 211)
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: tests/store.busy-lock.test.ts
- **Acceptance**: Four bun processes each open the shared file DB, append one SAFE-5 audit row and close it, 40 times each, at the same time; every append succeeds, the audit_log holds all 160 rows and verifyAudit reports the chain ok. The same test loses rows (database is locked) on the pre-fix deferred transaction.

## Evidence

- Verification commit: `49bef4449cab53a7652dedcb3b6b6250250fc0ec`
- Base commit: `9cab0ec853d8b4b55acda7f1ff708a6b68a1a130`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Adversarial review of PR #211 (`appendAudit` and `rescrubDatabase` take the
shared-DB write lock up front with BEGIN IMMEDIATE so busy_timeout applies).
The bug reproduces on origin/main: with another process holding RESERVED, a
deferred BEGIN + SELECT + INSERT fails at once with "database is locked"
because SQLite does not call the busy handler when upgrading an open read
transaction. The fix is correct and complete: every other `db.transaction`
on the shared DB either starts with a write (`watch/session-store.ts`
persist, `watch/dedup.ts` addMany — probed: those wait under busy_timeout)
or already uses `.immediate()` (`agent/spend.ts`, `agent/spend-alerts.ts`).
`migrateCorvidinhoDb` runs each statement in autocommit, so it has no
read-then-write upgrade either.

The gap: REQ-plugins-287's second acceptance bullet ("concurrent appenders
in several processes lose no rows") was backed only by a manual stress run
that was not committed. This change adds that test. No production code
changes; the archived PR #211 change keeps the fix and its REQs.

Measured: 4 processes x 40 open/append/close on one file DB. With main's
`appendAudit` swapped in, every run lost rows ("database is locked" in the
children); with the fix, 160/160 rows and the chain verifies.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "concurrent appenders in several processes lose no rows and keep one chain (SAFE-5)" | 4 bun children start together and each opens the shared file DB, appends one audit row and closes it, 40 times (as a dangerous plugin run's `recordAudit` does). Every child reports 40 ok and no errors; `verifyAudit` is ok with 160 rows. With origin/main's `appendAudit` (deferred transaction) swapped in, the test failed 3 of 3 runs with "SQLiteError: database is locked" in the children; restored, it passed 3 of 3. |
| `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "appendAudit waits under busy_timeout and links after the other writer's row (SAFE-5)" | unchanged from PR #211: fails on origin/main, passes with the fix. |
| `REQ-discord-287` | `tests/store.busy-lock.test.ts` "rescrubDatabase waits under busy_timeout instead of failing at once (SAFE-6)" | unchanged from PR #211: fails on origin/main, passes with the fix. |

## Where these lessons go

- `specs/plugins/context.md`
