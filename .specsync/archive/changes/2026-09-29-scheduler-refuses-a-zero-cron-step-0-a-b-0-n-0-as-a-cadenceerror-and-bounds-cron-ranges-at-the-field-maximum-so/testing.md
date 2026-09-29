---
change: scheduler-refuses-a-zero-cron-step-0-a-b-0-n-0-as-a-cadenceerror-and-bounds-cron-ranges-at-the-field-maximum-so
artifact: testing
---

# Testing

With `main`'s `src/scheduler/cron.ts` (`0f2e2c2`) swapped in,
`bun test tests/scheduler.cron.test.ts tests/discord.schedule.test.ts` gives
23 pass and 10 fail: the seven zero-step cases and the range case are each
killed by the child's 10 s timeout (the parser never returns), the
`/schedule create` handler case is killed the same way, and `5/0` is
accepted instead of refused. After the fix (file restored): 33 pass, 0 fail.
The hang cases run in a child `bun -e` with `Bun.spawnSync({ timeout })`, so
on a hanging parser the child is killed and the test fails instead of
hanging the runner.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-020` (zero step refused, no hang) | `tests/scheduler.cron.test.ts` | `*/0 * * * *`, `0-59/0 * * * *`, `0,*/0 * * * *`, `0 */0 * * *`, `0 0 1-31/0 * *`, `0 0 * */0 *`, `0 0 * * 1-5/0`: in a child bun (10 s timeout) `validateAndResolveCadence` throws `CadenceError` `Invalid cron step in "…": the step must be 1 or more.` and `getNextCronDate` throws `CadenceError`; exit 0, empty stderr. `5/0 * * * *` / `0 5/0 * * *` throw `CadenceError` from `validateAndResolveCadence`, `parseCron` and `getNextCronDate`. |
| `REQ-discord-020` (ranges bounded at the field maximum) | `tests/scheduler.cron.test.ts` | `0-99999999999 * * * *` is refused by the 5-minute rule (`Minimum interval is 5 minutes`); `9007199254740992-9007199254740993 * * * *` gets `CadenceError` / `No matching cron date`; `0 0-99999999999/2 * * *` resolves to itself with the same next run as `0 */2 * * *` — all in a child bun with a timeout. |
| `REQ-discord-020` (unchanged cadences) | `tests/scheduler.cron.test.ts` | `*/5 * * * *`, `10-50/10 * * * *`, `0 */6 * * *`, `0 9 * * 1-5`, `0 22-23 * * *`, `0 0 1,15 * *`, `0 0 * * 0-7`, `0 0 1 1-12/3 *`, `every 5 minutes`, `every 2 hours` resolve as before; the existing resolve / 5-minute tests pass unchanged. |
| `REQ-discord-020` / DISCORD-SCHEDULE-4 (`/schedule create` replies, bridge keeps answering) | `tests/discord.schedule.test.ts` | in a child bun (10 s timeout) the owner's `/schedule create` with `*/0 * * * *` and with `0-59/0 * * * *` each gets one ephemeral reply `Invalid cron step in "…/0": the step must be 1 or more.`, no schedule is stored, and a following `/schedule list` answers `No schedules`. |
| `REQ-discord-020` (earlier fixtures) | `tests/discord.schedule.test.ts`, `tests/scheduler.*.test.ts` | every existing assertion passes unchanged. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` (Bun 1.4.2) — see the change check record.
- `specsync check --require-coverage 100` — passed.
- `hi check` — passed.
- `fledge lanes run verify --non-interactive` — green (see the change check record).
