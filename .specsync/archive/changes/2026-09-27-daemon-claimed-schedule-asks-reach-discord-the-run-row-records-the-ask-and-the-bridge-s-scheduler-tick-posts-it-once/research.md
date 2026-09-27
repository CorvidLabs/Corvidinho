---
change: daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once
artifact: research
---

# Research

- `src/scheduler/service.ts` (main fc0ed8d) `runOne`: the ask post block
  runs only when `schedule.channelId && this.outbound?.post`; the daemon
  passes no outbound, so nothing is posted and nothing is kept for later.
  `finish()` passes only `askReason` to `onRunFinished`.
- `src/scheduler/store.ts` `markRunFinished` writes status / summary /
  error / completed_at; for a stuck run the summary is `failed (exit 1)`.
- `src/daemon/daemon.ts` logs `run.needs_human` with the reason (and the
  generic spend-cap summary); REQ-cli-098 requires only that log.
- The 80% spend warning already has an outbox (`src/agent/spend-outbox.ts`,
  `spend_alerts` rows) that any bridge post drains; asks had none.
- Repro (scratch test, same as the new `tests/scheduler.ask-outbox.test.ts`):
  a daemon-wired and a bridge-wired `SchedulerService` on one in-memory DB;
  the daemon runs a `stuckAfterVerifyAsk(2)` run → `onRunFinished`
  `{ ok: false, error: "failed (exit 1)", askReason: "stuck" }`, row summary
  `failed (exit 1)`; three bridge ticks → 0 posts. The `startDaemon` +
  `startBridge` end-to-end test also gets 0 replies on main.
- `discord.spend.test.ts` "a spend-cap post that failed … the next tick
  pings" pins today's behaviour for a bridge-claimed run: a failed
  in-process post is not retried (the next run's post pings). Kept.
