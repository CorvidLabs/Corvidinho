---
change: watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-247` | `tests/watch.dedup-durable.test.ts` | 6 tests: restarted poller on the same data dir sees `new=0`, agent ran once, 2 comments (ack + summary) not 4; 2000 stranger mentions refused and the trusted request never continues again; failed id write leaves the event for the next cycle and the cycle completes; processed/acked/summarized ids persist per kind across DB handles, case-insensitive; durable store not FIFO-capped; in-memory store keeps the FIFO cap. 1/6 pass on main, 6/6 after. |
| `REQ-watch-037` | `tests/watch.session-store.durable.test.ts` | Existing per-event isolation, restart continuity, stop and single-flight tests still pass with DB-backed id stores. |
| `REQ-watch-005` / `REQ-watch-007` / `REQ-watch-009` | `tests/watch.poller.test.ts`, `tests/watch.ack.test.ts`, `tests/watch.reliability.test.ts` | Existing second-pass dedup, ack-once and summary-once tests still pass. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean.
