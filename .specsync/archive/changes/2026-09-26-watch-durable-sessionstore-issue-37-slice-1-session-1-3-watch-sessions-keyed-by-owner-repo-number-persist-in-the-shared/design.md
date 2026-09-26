---
change: watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared
artifact: design
---

# Design

- Table `watch_sessions(id PK, issue_key UNIQUE, repo, number, user_id, topic,
  created_at, last_activity_at)` plus an index on `last_activity_at`; schema v6.
  `issue_key` is `lower(owner/repo)#number` (same as `issueKey()`).
- `SessionStore({ db?, ttlMs?, now? })`: without `db` it is the old in-memory
  store (tests, router unit tests). With `db` it loads non-expired rows on
  construct and deletes expired ones; `create`/`touch` upsert.
- Soft TTL: `getByIssue`, `get` and `list` purge sessions idle longer than
  `ttlMs` (maps and DB), so the router's existing "no session, start" path
  starts fresh (SESSION-1..3). Activity (`touch`) extends the session.
- One session per issue: `create` supersedes any prior session for the same
  issue key (memory and DB), keeping the UNIQUE invariant.
- Topic is scrubbed with `scrubOpt` on persist (SAFE-6) and the column is in
  SCRUB_TARGETS so a rules bump re-scrubs it.
- `startWatchPoller` opens the shared DB after config loads (in-memory for
  dry-run without `CORVIDINHO_DATA_DIR`), accepts injected `db`,
  `sessionStore`, `sessionTtlMs`, logs the restored count, and closes a DB it
  opened on `stop()`. `github watch` gets durability through this path; no
  new CLI surface.
