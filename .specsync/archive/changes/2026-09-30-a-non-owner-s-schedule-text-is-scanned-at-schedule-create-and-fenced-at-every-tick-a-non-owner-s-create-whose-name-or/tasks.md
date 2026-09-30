---
change: a-non-owner-s-schedule-text-is-scanned-at-schedule-create-and-fenced-at-every-tick-a-non-owner-s-create-whose-name-or
artifact: tasks
---

# Tasks

- [x] Research: every path where a schedule's text is written or reaches a run (create, pause / resume / delete, tick for owner and non-owner, schedule ask answers).
- [x] `scheduleInjection`, `injectedScheduleQuestion`, `creatorRole`, `refuseInjectedRun`, the non-owner fence and the `recordAudit` / `mutedUsers` options (`src/scheduler/service.ts`); `schedule-prompt` surface (`src/discord/injection-guard.ts`).
- [x] `/schedule create` SAFE-13 refusal before the ADMIN gate, ephemeral, nothing stored (`src/discord/command-handlers/schedule.ts`).
- [x] Bridge passes `mutedUsers` and `recordAudit` to the scheduler (`src/discord/bridge.ts`).
- [x] Tests: `tests/scheduler.injection.test.ts` (create refusal, fence by role, owner unchanged, stored injection paused with one owner ask, daemon-then-bridge delivery, bridge audit row).
- [x] Fail-on-base proof (base service / schedule handler / injection-guard / bridge swapped in: 9 of 12 fail; restored: all pass).
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md` E.6.a.
- [x] Spec: delta (REQ-discord-713 Added), `discord.spec.md` prose, scenario, error cases, files list; `testing.md`.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.
