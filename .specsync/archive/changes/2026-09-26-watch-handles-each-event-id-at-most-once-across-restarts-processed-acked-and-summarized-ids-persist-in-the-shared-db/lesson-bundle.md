# Lesson bundle — watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH handles each event id at most once across restarts: processed, acked and summarized ids persist in the shared DB and denied ids no longer evict handled ids
- **Kind**: BugFix
- **Specs**: watch
- **Paths**: src/watch/dedup.ts, src/watch/poller.ts, src/watch/ack.ts, src/watch/summary.ts, tests/watch.dedup-durable.test.ts, docs/WATCH.md
- **Acceptance**: A restarted watcher on the same data dir does not re-run, re-ack or re-summarize an event id it already handled; 2000 denied stranger mentions do not evict a handled trusted id, so the trusted request never runs twice; processed/acked/summarized ids persist per kind in the shared DB; without a DB the stores stay in-memory with the old FIFO cap.

## Evidence

- Verification commit: `9fc9999354807699d2f13a510e1f22620f29d702`
- Base commit: `7af2cec07739d7af3cf3ab6e77855707cdaa1e68`
- Verified by: `specsync check --spec watch`

## From the change's context.md

# Context

Bug report watch-github-3 (medium). `startWatchPoller` built new in-memory
`ProcessedIdStore`, `AckedIdStore` and `SummarizedIdStore` on every start, and
each was a Set capped at 2000 that evicts by first insertion. The search
re-fetches a 2-day window every cycle. Two ways to replay a handled trusted
request:

- Restart: after a redeploy, crash or reboot every allowlisted mention,
  assignment or review request from the last 2 days looked new. The agent
  re-ran the old instruction (e.g. "@bot open a release PR") and posted a
  second ack and a second summary. Repro on main: two pollers, same comment →
  process #2 cycle 1 `new=1`, agent spawned twice, 4 comments on the issue.
- Stranger flood: every denied id went into the same `ProcessedIdStore(2000)`.
  A non-allowlisted user posting ~2000 bot mentions (40 issues x 50 comments)
  evicted the id of an already-handled trusted request, which fired again on
  the next cycle. Repro on main: cycle 1 started=1, cycle 2 refused=2000,
  cycle 3 continued=1.

HI / rules: REQ-watch-005, REQ-watch-007, REQ-watch-009 ("at most once per
event id"), WATCH-RELIABILITY-1, ALLOW-1.

Constraints: open PR #189 bumps `SCHEMA_VERSION` to 8 for a different column,
so this fix does not take a schema version; the table is created with
`CREATE TABLE IF NOT EXISTS` by the store. No new env vars, flags or slash
commands.

## From the change's design.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-247` | `tests/watch.dedup-durable.test.ts` | 6 tests: restarted poller on the same data dir sees `new=0`, agent ran once, 2 comments (ack + summary) not 4; 2000 stranger mentions refused and the trusted request never continues again; failed id write leaves the event for the next cycle and the cycle completes; processed/acked/summarized ids persist per kind across DB handles, case-insensitive; durable store not FIFO-capped; in-memory store keeps the FIFO cap. 1/6 pass on main, 6/6 after. |
| `REQ-watch-037` | `tests/watch.session-store.durable.test.ts` | Existing per-event isolation, restart continuity, stop and single-flight tests still pass with DB-backed id stores. |
| `REQ-watch-005` / `REQ-watch-007` / `REQ-watch-009` | `tests/watch.poller.test.ts`, `tests/watch.ack.test.ts`, `tests/watch.reliability.test.ts` | Existing second-pass dedup, ack-once and summary-once tests still pass. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean.

## Where these lessons go

- `specs/watch/context.md`
