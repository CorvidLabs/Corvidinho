---
change: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
artifact: tasks
---

# Tasks

- [x] Check the other red smoke runs (only runs 36729963046 and 36665216215 fail this test).
- [x] Reproduce with a slow-fsync shim; capture the assertion and the starved step.
- [x] Add the two brief-release regression tests; both fail 8/8 on the unfixed tree.
- [x] `retryWhileBusy`; the open in one transaction under it; the append's BEGIN under it.
- [x] Stressed loop before (unfixed) and three batches after.
- [x] Spec prose, deltas (REQ-plugins-287, REQ-discord-287 Modified), testing evidence.
- [x] SpecSync checks, hi check, tsc, full test suite and verify lane green.
