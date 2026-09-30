---
change: a-non-owner-s-schedule-text-is-scanned-at-schedule-create-and-fenced-at-every-tick-a-non-owner-s-create-whose-name-or
artifact: plan
---

# Plan

1. Map every path where a schedule's text is written or reaches a run
   (research).
2. `scheduleInjection` / `injectedScheduleQuestion` and the tick's role,
   refusal and fence in `src/scheduler/service.ts`; `schedule-prompt`
   surface.
3. `/schedule create` refusal before the ADMIN gate
   (`src/discord/command-handlers/schedule.ts`).
4. Bridge wiring (`recordAudit`, `mutedUsers`).
5. Tests in `tests/scheduler.injection.test.ts`; prove they fail on base.
6. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose, scenario,
   error cases, files list, testing notes, delta (REQ-discord-713 Added).
7. Approve, `change check --commit`, audit, coverage, `hi check`, tsc,
   `bun test`, fledge verify.
