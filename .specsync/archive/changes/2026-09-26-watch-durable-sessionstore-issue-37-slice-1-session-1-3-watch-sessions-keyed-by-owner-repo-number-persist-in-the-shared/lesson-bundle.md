# Lesson bundle — watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH durable SessionStore (issue #37 slice 1, SESSION-1..3): WATCH sessions keyed by owner/repo#number persist in the shared SQLite DB (schema v6 watch_sessions) with the same soft TTL as Discord; activity keeps the session, idle past TTL starts fresh, sessions reload on restart; github watch opens the shared DB (in-memory for dry-run without a data dir and tests); topic scrubbed per SAFE-6; turn persistence/replay and summaries stay follow-ups
- **Kind**: Feature
- **Specs**: watch, discord
- **Paths**: src/watch/session-store.ts, src/watch/poller.ts, src/watch/index.ts, src/store/db.ts, src/store/scrub.ts, tests/watch.session-store.durable.test.ts, tests/store.scrub.test.ts, docs/WATCH.md, specs/watch/, specs/discord/
- **Acceptance**: Shared DB migrates to schema v6 with a watch_sessions table (one row per owner/repo#number); a DB-backed WATCH SessionStore persists create/touch and reloads non-expired sessions on reopen so the same issue continues after a restart; soft TTL from resolveSessionTtlMs (SESSION-1..3): activity within TTL keeps the session, idle past TTL is purged and the next event starts a fresh session, expired rows are dropped on load; one session per issue key; stored topic is SAFE-6 scrubbed and watch_sessions.topic is in SCRUB_TARGETS; startWatchPoller opens the shared DB (in-memory for dry-run without CORVIDINHO_DATA_DIR, injectable db/sessionStore for tests) and closes it on stop; in-memory SessionStore still works with no db; turn persistence/replay and stored summaries not built; fixture tests + SpecSync + fledge verify green

## Evidence

- Verification commit: `81075a56c927f9b34c0e313aa604c934dea00667`
- Base commit: `a49987d653499f40af938f26961c98e017c7777b`
- Verified by: `specsync check --spec discord --spec watch`

## From the change's context.md

# Context

Issue #37 (SESSION continuity, M2 Talk anywhere). #61 made the Discord
SessionStore durable (SQLite `discord_sessions`, soft TTL from
`resolveSessionTtlMs`, SESSION-1..4) but explicitly left the WATCH
SessionStore in memory: a `github watch` restart forgot which
`owner/repo#number` had a live session, and WATCH sessions never expired, so an
issue pinged hours later "continued" a stale session (against SESSION-1..3).
Leif's planning comment on #37 (2026-09-26) lists "WATCH still keeps its
session map in memory" as the remaining continuity gap.

This change is slice (1) only: durable WATCH sessions with the same soft TTL.
Not built here (follow-ups): turn persistence/replay (resume-by-id relates to
retired CLI-6; no captured HI), stored conversation summaries (draft, see #72
SESSION-5/6), durable processed-id/ack dedup for WATCH, and "clear new topic"
detection. Cross-session continuity still comes from MEMORY (SESSION-4).

## From the change's design.md

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

## From the change's testing.md

# Testing

- `tests/watch.session-store.durable.test.ts`: schema v6 + table; reopen keeps
  the session and issue map; touch within TTL keeps it (router continues);
  idle past TTL purges and router starts a fresh session; expired rows dropped
  on load; one session per issue key; topic scrubbed in DB; `watch_sessions.topic`
  is a SCRUB_TARGETS entry and re-scrubs; a v5 DB migrates to 6; poller on the
  same data dir continues the same issue session across a restart; injected db
  is not closed; dry-run poller without a data dir stays in-memory.
- Same file, review hardening: `stop()` mid-cycle starts no further agent spawn
  and waits for the in-flight run before closing the DB; `stop()` while the ack
  is in flight skips that event's spawn; concurrent `pollOnce` joins the
  in-flight cycle and interval ticks are skipped while a long cycle runs (fake
  timers); a throwing event is logged, marked processed, and later events still
  run; `touch` after a second watcher replaced the issue row does not throw and
  does not wedge the poll cycle.
- Existing `tests/watch.*.test.ts` stay green (in-memory store path).

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-watch-037 | `tests/watch.session-store.durable.test.ts` |
| REQ-discord-037 | `tests/watch.session-store.durable.test.ts` |

## Where these lessons go

- `specs/watch/context.md`
- `specs/discord/context.md`
