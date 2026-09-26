---
change: watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared
artifact: research
---

# Research

- `src/discord/session-store.ts` (#61) is the pattern: optional `db`,
  `ttlMs` (default `resolveSessionTtlMs()`), injectable `now`, load on
  construct dropping expired rows, persist on create/touch, purge-on-lookup.
- `src/store/db.ts` is at schema v5 (audit_log); migrations are additive
  `if (version < N)` blocks that record the version string. v6 adds
  `watch_sessions`.
- `src/store/scrub.ts` SCRUB_TARGETS must list every persisted free-text
  column (SAFE-6). `watch_sessions.topic` holds the GitHub issue title.
- `startBridge` opens the DB in-memory for dry-run without
  `CORVIDINHO_DATA_DIR` so tests never touch `~/.local/share`; WATCH mirrors it.
- The WATCH processed-id and ack stores are still in memory; after a restart
  recent events can re-fire and now continue the persisted session instead of
  starting a new one. Durable dedup is a separate follow-up.
