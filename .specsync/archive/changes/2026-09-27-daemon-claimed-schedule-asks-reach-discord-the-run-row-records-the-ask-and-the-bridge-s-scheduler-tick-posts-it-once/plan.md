---
change: daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once
artifact: plan
---

# Plan

1. Re-check the gap on current main (fc0ed8d): still present.
2. Regression tests `tests/scheduler.ask-outbox.test.ts`; confirm they fail
   on main's sources.
3. Schema v11 + `SCRUB_TARGETS`; store `markRunFinished` ask, `pendingAsks`,
   `claimRunAsk`, `releaseRunAsk`.
4. Service: `postRunAsk`, in-process claim, `deliverPendingAsks` from
   `tick()`, `settleAskDelivery`.
5. Bump the pinned schema-version assertions; daemon comment; docs; spec
   text, `files:` and testing notes; deltas (Added REQ-discord-347, Modified
   REQ-discord-108 and REQ-cli-098).
6. `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
