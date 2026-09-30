---
change: shared-db-open-takes-the-write-lock-up-front-so-processes-that-open-a-new-file-or-one-with-a-re-scrub-due-at-once-take
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-287`, `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "processes that open a new shared DB file at once all get in and append (SAFE-5)" | Six APPENDER children open a new file at the same moment and append one row each. With the previous change's `src/store/db.ts` (deferred transaction) it failed 3 of 3 runs in about 0.42 s: five children reported `SQLiteError: no such table: main.discord_sessions`. With `origin/main`'s code it passed 2 of 2; with this fix 5 of 5: every append lands, the file is at `SCHEMA_VERSION` and the chain verifies. |
| `REQ-discord-287`, `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "processes that open a shared DB file with a re-scrub due at once all get in and append (SAFE-6)" | 10 000 `discord_work_tasks` rows (one holding a GitHub-token-shaped secret), `scrub_rules_version` set to 0, then four APPENDER children open at once. Previous change: failed 3 of 3 runs after about 5.5 s (`SQLiteError: database is locked`). `origin/main`: passed 2 of 2; this fix: 5 of 5; the secret is redacted, `SCRUB_RULES_VERSION` is recorded and the chain verifies. |
| `REQ-discord-287` | `tests/store.busy-lock.test.ts` "openCorvidinhoDb gets in when another process frees the file only briefly, after a long wait (SAFE-5)" (unchanged) | Still fails on `origin/main` (3 of 3, database is locked after about 5.1 s) and passes with this fix (20 of 20 under six CPU spinners). |
| `REQ-plugins-287` | `tests/store.busy-lock.test.ts` "concurrent appenders in several processes lose no rows and keep one chain (SAFE-5)" (unchanged, now through the shared `runAppenders` helper) | Every fsync/fdatasync 20 ms longer (scratch LD_PRELOAD shim): `origin/main` lost a row in 6 of 6 runs (`{ ok: 39, errors: ["SQLiteError: database is locked"] }`), 10 ms: 3 of 12; this fix, whole file (seven tests) at 20 ms: 8 of 8 runs passed; without the shim 10 of 10. |
| `REQ-discord-287` | scratch harness (not in the suite): 8 processes opening a new file; 4 or 8 opening one with a re-scrub due over 4 000 or 10 000 rows | Previous change: new file 7 of 8 failed in 3 of 3 runs; re-scrub due (10 000 rows) 3 of 4 (4 procs) and 7 of 8 (8 procs) failed. Deferred transaction with only the COMMIT under busy_timeout: re-scrub due all in (46-95 ms), new file still 7 of 8 failed. This fix: all in, new file (5 of 5 runs, 2 more with 10 ms fsync), re-scrub due 58-225 ms (`origin/main` 31-158 ms). |
| `REQ-discord-287` | full `bun test` | Every test opens its DB through the changed `openCorvidinhoDb`; the suite passes. |
