---
change: watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared
artifact: requirements
---

# Requirements

1. Schema v6 adds `watch_sessions` (one row per `owner/repo#number`); fresh and
   v5 DBs migrate to 6.
2. A DB-backed WATCH SessionStore persists create/touch and reloads
   non-expired sessions on reopen; the same issue continues after a restart.
3. Soft TTL from `resolveSessionTtlMs` (SESSION-1..3): activity within TTL keeps
   the session; idle past TTL purges it and the next event starts a new one;
   expired rows are dropped on load.
4. Topic is SAFE-6 scrubbed on persist; `watch_sessions.topic` is in
   SCRUB_TARGETS.
5. `startWatchPoller` opens the shared DB (in-memory for dry-run without a data
   dir; injectable db/sessionStore) and closes an owned DB on stop.
6. No turn persistence/replay, no summaries, no new CLI/slash surface.
