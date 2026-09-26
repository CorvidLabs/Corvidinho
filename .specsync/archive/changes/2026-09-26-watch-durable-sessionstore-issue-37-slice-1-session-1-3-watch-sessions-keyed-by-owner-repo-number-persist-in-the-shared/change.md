---
id: watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared
state: archived
type: feature
base_commit: a49987d653499f40af938f26961c98e017c7777b
---

# WATCH durable SessionStore (issue #37 slice 1, SESSION-1..3): WATCH sessions keyed by owner/repo#number persist in the shared SQLite DB (schema v6 watch_sessions) with the same soft TTL as Discord; activity keeps the session, idle past TTL starts fresh, sessions reload on restart; github watch opens the shared DB (in-memory for dry-run without a data dir and tests); topic scrubbed per SAFE-6; turn persistence/replay and summaries stay follow-ups

## Intent

WATCH durable SessionStore (issue #37 slice 1, SESSION-1..3): WATCH sessions keyed by owner/repo#number persist in the shared SQLite DB (schema v6 watch_sessions) with the same soft TTL as Discord; activity keeps the session, idle past TTL starts fresh, sessions reload on restart; github watch opens the shared DB (in-memory for dry-run without a data dir and tests); topic scrubbed per SAFE-6; turn persistence/replay and summaries stay follow-ups

## Affected Canonical Specs

- `watch`
- `discord`

## Acceptance Criteria

- Shared DB migrates to schema v6 with a watch_sessions table (one row per owner/repo#number); a DB-backed WATCH SessionStore persists create/touch and reloads non-expired sessions on reopen so the same issue continues after a restart; soft TTL from resolveSessionTtlMs (SESSION-1..3): activity within TTL keeps the session, idle past TTL is purged and the next event starts a fresh session, expired rows are dropped on load; one session per issue key; stored topic is SAFE-6 scrubbed and watch_sessions.topic is in SCRUB_TARGETS; startWatchPoller opens the shared DB (in-memory for dry-run without CORVIDINHO_DATA_DIR, injectable db/sessionStore for tests) and closes it on stop; in-memory SessionStore still works with no db; turn persistence/replay and stored summaries not built; fixture tests + SpecSync + fledge verify green

## No-spec Rationale

Not applicable
