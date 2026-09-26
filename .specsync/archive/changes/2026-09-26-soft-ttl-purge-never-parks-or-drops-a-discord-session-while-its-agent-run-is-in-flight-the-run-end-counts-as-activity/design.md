---
change: soft-ttl-purge-never-parks-or-drops-a-discord-session-while-its-agent-run-is-in-flight-the-run-end-counts-as-activity
artifact: design
---

# Design

- `SessionStore` keeps a private `activeRuns` map (session id → count of
  runs in flight).
- New `SessionStore.runActive(session, fn)`: marks the session busy, awaits
  `fn`, then un-marks it and `touch()`es the session (the end of a run is
  activity, SESSION-2). The touch is skipped when the session is no longer
  the live one in the store (already ended), so an ended talk is never
  re-persisted.
- `purgeIfExpired` returns early for a busy session, so no lookup drops or
  parks it while its agent runs (SESSION-WORKTREE-3).
- The three `agent.runChat` call sites (bridge mention/reply/thread path,
  `/work`, `/session start`) wrap the call in `store.runActive`. Nothing
  else changes: TTL value, lookup semantics for idle sessions, park/end
  paths, schema, env, and slash surfaces stay as they are.
