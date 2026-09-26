---
change: watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db
artifact: plan
---

# Plan

1. Regression test `tests/watch.dedup-durable.test.ts` (fails on main).
2. Durable `ProcessedIdStore` with per-kind namespace in `watch_event_ids`;
   `AckedIdStore` / `SummarizedIdStore` as subclasses.
3. Poller: pass the session `db` to the three stores; separate in-memory
   denied-id store; fresh filter by `has`; per-event catch survives a failed
   id write.
4. docs/WATCH.md, spec Public API / Invariants / testing list, delta
   REQ-watch-247.
5. SpecSync check, tsc, bun test, fledge verify lane.
