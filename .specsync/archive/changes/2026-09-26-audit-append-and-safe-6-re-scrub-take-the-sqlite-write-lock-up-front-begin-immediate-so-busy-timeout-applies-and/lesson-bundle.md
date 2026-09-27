# Lesson bundle — audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Audit append and SAFE-6 re-scrub take the SQLite write lock up front (BEGIN IMMEDIATE) so busy_timeout applies and concurrent writers wait instead of failing with database is locked (SAFE-5, SAFE-6)
- **Kind**: BugFix
- **Specs**: plugins, discord
- **Paths**: src/audit/log.ts, src/store/scrub.ts, tests/store.busy-lock.test.ts, specs/plugins
- **Acceptance**: While another process holds the shared DB write lock and then commits, appendAudit (SAFE-5 dangerous-run rows) and rescrubDatabase (SAFE-6 re-scrub) wait under busy_timeout and succeed instead of failing at once with database is locked; the waiting audit row links to the other writer's row and the chain verifies

## Evidence

- Verification commit: `d38f210d5b05f9b905cd69d2ad6c55329f84d8b1`
- Base commit: `05b269af23ea2be9e9c41966f6cf9ee41dfeac02`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

# Context

Bug hunt finding store-memory-audit-6 (medium). `appendAudit`
(src/audit/log.ts) and `rescrubDatabase` (src/store/scrub.ts) ran in
`db.transaction(fn)()`, a deferred BEGIN: SELECT first (SHARED lock), then
the write asks for RESERVED. When another process already holds RESERVED on
the shared DB file, SQLite returns SQLITE_BUSY for that upgrade without
calling the busy handler (the connection already has a read transaction), so
`PRAGMA busy_timeout = 5000` set in `openCorvidinhoDb` (src/store/db.ts)
never applied and the call failed at once with "database is locked".

Impact: two processes appending at once (two Discord talks, or a schedule and
a talk, each running a dangerous plugin). A failed `started` append makes
`runPlugin` refuse the dangerous run ("audit log unavailable", fail closed);
a failed `ok` / `error` append is swallowed by `safeRecord`, so the SAFE-5
trail shows the action started with no outcome. The same failure hits every
concurrent `openCorvidinhoDb` when `SCRUB_RULES_VERSION` is bumped (SAFE-6
re-scrub). Violates SAFE-5 (hi/safe.md, complete audit trail;
REQ-plugins-095) and the busy-timeout intent in src/store/db.ts.

## From the change's design.md

# Design

- `appendAudit`: run the read-prev-hash + INSERT body with
  `db.transaction(fn).immediate()` (BEGIN IMMEDIATE). The write lock is taken
  before the prev-hash SELECT, under busy_timeout, so a concurrent writer is
  waited for and the new row links to the latest committed row.
- `rescrubDatabase`: same change, so concurrent openers after a
  `SCRUB_RULES_VERSION` bump wait for each other instead of failing.
- No schema, pragma, env var, config key, CLI or slash change. Journal mode
  stays as is; WAL for the shared DB is left as a separate follow-up (it
  changes on-disk files and reader/writer behavior beyond this fix).
- If the other writer holds the lock longer than busy_timeout (5 s) the call
  still fails with SQLITE_BUSY, and `runPlugin` still fails closed for a
  `started` row as REQ-plugins-095 requires.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-287` | `tests/store.busy-lock.test.ts` | a child bun process holds the shared DB write lock (BEGIN IMMEDIATE, one audit row) for 750 ms, then commits; the parent's `appendAudit` waits under busy_timeout, gets seq 2, its `prev_hash` is the child's row hash and `verifyAudit` is ok with 2 rows. Failed before the fix ("database is locked"), passes after. |
| `REQ-discord-287` | `tests/store.busy-lock.test.ts` | a raw pre-scrub `discord_sessions.topic` holding a runtime-built fake token; while the child holds the write lock, the parent's `rescrubDatabase` waits, updates 1 row and redacts the token. Failed before the fix ("database is locked"), passes after. |
| `REQ-plugins-095` | `tests/audit.log.test.ts` | chain, append-only triggers, tamper detection, started/ok/denied rows and fail-closed refusal unchanged. |
| `REQ-discord-066` | `tests/store.scrub.test.ts` | scrub patterns, persist-time scrub and once-per-version re-scrub unchanged. |

Manual stress (4 bun processes x 300 open/append/close on one file DB): before
the fix 1167/1200 appends landed ("database is locked" in every process);
after, 1200/1200 and the chain verifies.

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`
