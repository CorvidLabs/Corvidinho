---
change: audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and
artifact: testing
---

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
