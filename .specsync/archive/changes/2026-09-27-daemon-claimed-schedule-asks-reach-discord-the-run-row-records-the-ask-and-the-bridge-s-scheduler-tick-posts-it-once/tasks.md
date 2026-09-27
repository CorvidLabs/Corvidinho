---
change: daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once
artifact: tasks
---

# Tasks

- [x] Re-verify the gap on main fc0ed8d: a daemon-claimed stuck schedule run posts nothing and a bridge on the same DB never delivers it; not already fixed.
- [x] Regression tests `tests/scheduler.ask-outbox.test.ts` (13 tests); all 13 fail on main's sources and pass on the branch.
- [x] Schema v11: `schedule_runs.ask_reason` / `ask_question` / `ask_posted_at` + partial index; `ask_question` in `SCRUB_TARGETS`.
- [x] `ScheduleStore`: `markRunFinished` stores the scrubbed, capped ask; `pendingAsks`, `claimRunAsk`, `releaseRunAsk` (SQLite and memory).
- [x] `SchedulerService`: `postRunAsk` extracted; in-process claim before the post; fire-and-forget `deliverPendingAsks` from `tick()`; `settleAskDelivery`.
- [x] Pinned schema-version assertions updated (v11); daemon comment; `docs/DAEMON.md`, `docs/BOX-UPDATE.md`.
- [x] Spec text, `files:` and testing notes; deltas: Added REQ-discord-347, Modified REQ-discord-108 and REQ-cli-098.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
