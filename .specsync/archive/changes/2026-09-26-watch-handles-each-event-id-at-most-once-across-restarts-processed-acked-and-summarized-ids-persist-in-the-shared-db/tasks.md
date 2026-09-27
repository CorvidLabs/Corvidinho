---
change: watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db
artifact: tasks
---

# Tasks

- [x] Regression test that fails before the fix.
- [x] Durable per-kind ProcessedIdStore; AckedIdStore / SummarizedIdStore reuse it.
- [x] Poller passes its DB to the id stores; denied ids in a separate in-memory store.
- [x] Per-event catch survives a failed id write.
- [x] docs/WATCH.md, spec Public API / Invariants / testing list, delta REQ-watch-247.
