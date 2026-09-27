---
change: safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin
artifact: plan
---

# Plan

1. Reproduce on main: `/schedule delete` removes a schedule and its runs and leaves no audit row, even with the trail throwing or unset.
2. Add the "/schedule delete audit (SAFE-5)" tests in `tests/discord.schedule.test.ts`; wire `recordAudit` in the existing admin create/delete flow test; confirm the new tests fail on main's `schedule.ts`.
3. Record `started` before the delete (fail closed), `ok`/`error` after, and `denied` for a non-ADMIN delete, in `src/discord/command-handlers/schedule.ts`.
4. Modify REQ-discord-020 (delta + `specs/discord/requirements.md`), add testing evidence, update `discord.spec.md` and the operator docs.
5. Run specsync change check / audit / check --require-coverage 100, tsc, bun test and fledge verify.
