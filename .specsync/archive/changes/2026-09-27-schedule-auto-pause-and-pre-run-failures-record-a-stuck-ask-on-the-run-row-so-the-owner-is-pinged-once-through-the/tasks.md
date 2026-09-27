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
- [x] Review: a pause ask whose in-process post does not go out is handed back for the next delivery pass (a paused schedule has no next run); a run that throws posts its pause ask at once; a resolve / worktree step that throws is a pre-run failure; the pause ask of a run without its own ask carries only `failed (exit N)` as context. 3 more tests (and context assertions), failing on the first draft and on main.
