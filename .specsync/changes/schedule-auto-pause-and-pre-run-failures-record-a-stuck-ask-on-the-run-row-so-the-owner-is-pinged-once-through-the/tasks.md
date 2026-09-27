---
change: schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the
artifact: tasks
---

# Tasks

- [x] Re-verify the gap on main fbaa84b: auto-pause posts no ask (bridge: plain ❌ line, no ping; daemon: nothing) and the project-resolve / worktree failure branches post nothing.
- [x] Regression tests: 6 in `tests/scheduler.ask-outbox.test.ts`, 1 in `tests/scheduler.service.test.ts`; all 7 fail on main's scheduler sources and pass on the branch.
- [x] `ScheduleStore.markRunFinished`: optional `autoPause { at, ask }`, decided on the SQL failure count inside the IMMEDIATE transaction.
- [x] `SchedulerService`: fixed pre-run questions, `autoPauseAsk`, `failBeforeRun`, `finish()` returns the effective ask, `postOwnRunAsk` shared by both paths; `onRunFinished.askReason` follows the effective ask.
- [x] Docs: `docs/discord.md` (schedule asks, tick gates), `docs/DAEMON.md` (needs-human paragraph, `run.needs_human` row).
- [x] Spec paragraph in `specs/discord/discord.spec.md`, notes in `specs/discord/testing.md`, delta Added REQ-discord-353.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
