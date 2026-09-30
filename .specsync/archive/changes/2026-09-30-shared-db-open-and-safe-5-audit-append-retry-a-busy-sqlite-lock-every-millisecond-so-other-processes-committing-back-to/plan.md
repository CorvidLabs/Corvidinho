---
change: shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to
artifact: plan
---

# Plan

1. Reproduce: stress loops (CPU, parallel copies), then a slow-fsync shim;
   capture the failing assertion; instrument children (step, time, row order).
2. Regression tests first, run on the unfixed tree: a child frees the lock
   only from 970 to 1020 ms (between SQLite's tries at ~928 and ~1028 ms)
   and holds it past busy_timeout; one test for the append (IMMEDIATE), one
   for the open (EXCLUSIVE).
3. `retryWhileBusy` in `src/store/db.ts`; open in one transaction under it;
   `appendAudit`'s BEGIN under it.
4. Prove: regression tests fail before and pass after; the slow-fsync loop
   on the real test file before and three batches after.
5. Spec prose (plugins/discord Invariants), deltas, testing evidence.
6. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
