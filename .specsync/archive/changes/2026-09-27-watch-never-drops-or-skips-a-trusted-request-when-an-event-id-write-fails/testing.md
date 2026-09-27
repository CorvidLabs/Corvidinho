---
change: watch-never-drops-or-skips-a-trusted-request-when-an-event-id-write-fails
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-247` | `tests/watch.dedup-durable.test.ts` | "an id write that fails once and would succeed on retry still leaves the event for the next cycle": cycle 1 runs nothing and logs `not marked, retried next cycle`, the id is not recorded, cycle 2 runs it once, cycle 3 sees `new=0`. "a failed acked/summarized id write after the comment is posted still runs the agent once": the agent runs once, ack + summary are posted, both write failures are logged, nothing reaches logError, the next cycle sees `new=0`. Both fail on the PR #195 sources (logged "marked processed"; 0 agent runs) and pass after. The 6 earlier REQ-watch-247 tests still pass. |
| `REQ-watch-037` | `tests/watch.session-store.durable.test.ts` | "a failing event is logged and marked processed; later events still run" (routing failure) still passes. |
| `REQ-watch-009` / `REQ-watch-231` | `tests/watch.reliability.test.ts`, `tests/watch.summary-scrub.test.ts` | Summary-once and scrubbed-summary tests still pass after the merge of origin/main. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean.
