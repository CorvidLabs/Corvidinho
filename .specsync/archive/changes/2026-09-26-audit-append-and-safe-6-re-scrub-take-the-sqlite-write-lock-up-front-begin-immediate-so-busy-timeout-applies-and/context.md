---
change: audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and
artifact: context
---

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
