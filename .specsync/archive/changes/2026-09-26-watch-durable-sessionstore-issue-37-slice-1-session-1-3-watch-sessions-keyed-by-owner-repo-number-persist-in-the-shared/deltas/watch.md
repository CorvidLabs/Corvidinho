---
module: watch
change: watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared
---

# Delta — watch (durable WATCH sessions)

## Added

### REQUIREMENT REQ-watch-037

WATCH sessions keyed by `owner/repo#number` SHALL persist in the shared
SQLite DB (`watch_sessions`) when the SessionStore is given a database, and
SHALL reload on restart so a follow-up on the same issue continues the same
session. The same soft TTL as Discord sessions (`resolveSessionTtlMs`,
SESSION-1..3) SHALL apply: activity within the TTL keeps the session; a
session idle past the TTL is dropped (memory and DB) and the next event on
that issue starts a fresh session; expired rows are dropped on load. At most
one session exists per issue key. The stored topic SHALL be SAFE-6 scrubbed.
`startWatchPoller` SHALL open the shared DB (in-memory for dry-run without
`CORVIDINHO_DATA_DIR`), accept an injected db or SessionStore, and close a DB
it opened on stop. Without a database the SessionStore stays in-memory. Turn
persistence/replay and stored summaries are out of scope.

Acceptance Criteria
- A session created with a file DB is found by issue after reopening the DB.
- Activity within the TTL continues the session; idle past the TTL starts a new session and removes the old row.
- Expired rows are dropped when the store loads.
- A poller restarted on the same DB continues the same issue session.
- Stored topic has vendor-key-looking secrets redacted.
