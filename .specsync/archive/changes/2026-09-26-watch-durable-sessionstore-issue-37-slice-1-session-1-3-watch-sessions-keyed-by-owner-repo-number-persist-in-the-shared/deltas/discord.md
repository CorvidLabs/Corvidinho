---
module: discord
change: watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared
---

# Delta — discord (shared store schema v6)

## Added

### REQUIREMENT REQ-discord-037

The shared SQLite store SHALL migrate to schema version 6 with a
`watch_sessions` table (id, unique issue key, repo, number, user, topic,
created/last-activity timestamps) for durable WATCH sessions (#37 slice 1).
`watch_sessions.topic` SHALL be listed in SAFE-6 SCRUB_TARGETS so stored
titles are re-scrubbed when the rules tighten.

Acceptance Criteria
- Fresh and v5 DBs reach schema 6 with `watch_sessions`.
- SCRUB_TARGETS includes `watch_sessions.topic` and a re-scrub redacts it.
