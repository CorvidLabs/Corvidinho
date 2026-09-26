---
change: watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db
artifact: research
---

# Research

- `src/watch/poller.ts` created all dedup stores in memory on every start;
  denied ids were added to the same `processed` store as handled ids.
- `src/watch/dedup.ts`, `ack.ts`, `summary.ts`: three copies of a Set capped
  at 2000 with first-insertion eviction.
- `src/watch/searcher.ts` re-fetches a 2-day window each cycle and lists all
  comments on matching issues, and `issue-` / `assign-` / `reviewreq-` ids
  are stable per issue, so pruning durable ids by age would re-open the
  replay on long-lived issues; the durable sets are therefore not pruned
  (only allowlisted activity writes to them).
- `SessionStore` already persists to the shared DB (`watch_sessions`,
  REQ-watch-037); the poller hands the same `db` to the id stores.
- Open PR #189 bumps `SCHEMA_VERSION` to 8 for `discord_sessions.pending_ask`;
  a second v8 here would collide, so the table uses `CREATE TABLE IF NOT
  EXISTS` from the store instead.
- Repro before the fix: `tests/watch.dedup-durable.test.ts` 1 pass / 5 fail
  (restart: process #2 `new=1`; flood: cycle 3 continued=1; failed id write
  threw out of the cycle; durable store API missing).
