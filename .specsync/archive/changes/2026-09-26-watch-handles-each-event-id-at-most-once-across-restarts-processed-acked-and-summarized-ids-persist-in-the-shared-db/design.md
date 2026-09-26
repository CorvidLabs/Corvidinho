---
change: watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db
artifact: design
---

# Design

- `ProcessedIdStore` (src/watch/dedup.ts) takes `{ db?, maxSize? }` (a bare
  number still means `maxSize`) and a kind (`processed` | `acked` |
  `summarized`). With a db, `has` / `add` / `addMany` / `list` use table
  `watch_event_ids (kind, id, seen_at, PRIMARY KEY (kind, id))` with
  `INSERT OR IGNORE`; ids are lowercased as before; no count eviction. `has`
  reads the DB each time, so a second process on the same file sees the ids
  too. Without a db it is the old in-memory FIFO Set. New `durable` getter.
- `AckedIdStore` and `SummarizedIdStore` become thin subclasses with their own
  kind; same constructor shape, same behavior without a db.
  `SuccessfulAckStore` stays in-memory: it only links an ack to its summary
  inside one event's handling.
- The table is created by the store with `CREATE TABLE IF NOT EXISTS`, not a
  schema version, because open PR #189 takes v8 for another column. Rows hold
  event ids (`comment-<n>`, `issue-owner/repo#n`, ...), never free text, so
  there is no SAFE-6 scrub target.
- `startWatchPoller` passes the same `db` it uses for sessions to the three
  stores (dry-run without `CORVIDINHO_DATA_DIR` is still an in-memory DB; an
  injected `sessionStore` without `db` stays in-memory). Denied ids go to a
  separate in-memory `ProcessedIdStore`: a flood can only evict other denied
  ids, which are just refused again quietly, and strangers cannot grow the DB.
  The fresh filter checks both sets with `has` instead of loading the whole
  list each cycle.
- Per-event catch: ids are marked right after routing, before ack or spawn. If
  that write failed, the catch retries it once; if the DB is still failing it
  logs `not marked, retried next cycle` and moves on instead of throwing out of
  the cycle (REQ-watch-037).
- No new env vars, CLI flags or slash commands.
