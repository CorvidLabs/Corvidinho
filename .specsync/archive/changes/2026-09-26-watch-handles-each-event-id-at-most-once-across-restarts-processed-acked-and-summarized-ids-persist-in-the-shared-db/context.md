---
change: watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db
artifact: context
---

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
