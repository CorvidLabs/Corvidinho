---
change: i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c
artifact: tasks
---

# Tasks

- [x] Capture AGENT-3.c in `hi/agent.md` with `hi` (INTENT.md index updated); `hi check` passes.
- [x] `src/scheduler/store.ts`: `markRunFinished` `stopped` — `failed`, failure count kept, no ask.
- [x] `src/scheduler/service.ts`: `ScheduleRunStop`, `ScheduleRunStopHandle`, `SCHEDULE_RUN_STOPPED_SUMMARY`, `scheduleRunStoppedError`, `runStop` option, `beginStop`, `recordStopped`, linked signal, `finish()` on the success, throw and `finally` paths, no auto-pause or ask for a stop.
- [x] `src/scheduler/index.ts`: re-export the new types and helpers.
- [x] `src/discord/schedule-stop.ts`: `createScheduleRunStop` (channel progress embed with the Stop button; owner DM with the button added after the turn; `inOwnerDm`), `scheduleRunProgressText`.
- [x] `src/discord/bridge.ts`: one control over the run control, wired into the scheduler; `pressPassesGates` `{ inDm }` for a live owner-DM schedule run.
- [x] `src/discord/run-control.ts`: header note on schedule turns.
- [x] Tests: `tests/discord.schedule-stop.test.ts` (bridge, scheduler and module); fail-on-base proof recorded in testing.md.
- [x] Docs: `docs/discord.md`, `docs/DAEMON.md`, `docs/DISCORD-GO-LIVE.md`.
- [x] Specs: `discord.spec.md` (files, Public API, Invariants, scenario, error rows), `specs/discord/testing.md`, deltas (Added REQ-discord-304; Modified REQ-discord-302, REQ-discord-303).
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
