# Lesson bundle — scheduler-refuses-a-zero-cron-step-0-a-b-0-n-0-as-a-cadenceerror-and-bounds-cron-ranges-at-the-field-maximum-so

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Scheduler refuses a zero cron step (*/0, a-b/0, n/0) as a CadenceError and bounds cron ranges at the field maximum, so /schedule create replies instead of hanging the bridge
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/scheduler/cron.ts, tests/scheduler.cron.test.ts, tests/discord.schedule.test.ts, specs/discord/discord.spec.md, specs/discord/requirements.md
- **Acceptance**: A cadence with a zero cron step in any field (*/0, a-b/0, n/0, also inside a comma list) is refused with a CadenceError naming the step before any loop, so /schedule create replies with that message ephemerally and creates nothing instead of hanging the bridge; parseCron and getNextCronDate (store create/resume/claim) throw the same CadenceError; a range whose end is past the field maximum (0-99999999999) is bounded at that maximum so it resolves at once and falls to the existing 5-minute rule; every cadence accepted today with a step >= 1 resolves to the same cron; regression tests run the hang forms in a child bun with a timeout and fail on main; no new env var, config key, command, option or schema change

## Evidence

- Verification commit: `685c71c8f70db72cb0e4f992ecb86712c31eba8b`
- Base commit: `0f2e2c2774635d1dcbdff599cba92dbecf8eebd9`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

W12 bug sweep seed `cron-step-zero-hangs-bridge` (major), confirmed in Leif's
2026-09-28 interview (Wave 0: no new criteria). `parseField` in
`src/scheduler/cron.ts` matched a step with `/^(.+)\/(\d+)$/`, so `*/0` gave
`step = 0` and `for (let i = min; i <= max; i += step)` (and the range loop)
never ended. `/schedule create` calls `validateAndResolveCadence`
synchronously in the bridge process, so an owner typing
`cadence:"*/0 * * * *"` froze the whole bridge: no reply, no HEAR, no WATCH,
no scheduler ticks. On `0f2e2c2`,
`timeout 5 bun -e '…validateAndResolveCadence("*/0 * * * *")…'` exits 124;
`0-59/0 * * * *` and `0,*/0 * * * *` do the same. `every N minutes|hours`
input was already guarded (n < 5 / n < 1 throw); only raw cron got through.

Interview design call: also guard any other step/range forms that could loop
forever, and prove it with fail-on-main tests that run under a timeout.
Probing found two range forms: an end far past the field maximum
(`0-99999999999 * * * *` iterates ~1e11 times; `0-9999999` alone blocks for
~6.6 s) and an end past 2^53 (`9007199254740992-9007199254740993`), where
`i += 1` no longer changes `i` and the loop is truly endless.

Owning criteria (already captured, unchanged): REQ-discord-020 "Cadence SHALL
enforce a minimum interval of 5 minutes at create time" / AC "Cadence `<5m`
refused", and DISCORD-SCHEDULE-4 (HEAR / WATCH ingress stay within ~1 minute).
Constraints: bug fix only; no new env var, config key, command, option,
table or package bump; no CHANGELOG/STATUS edit; #232/#233 scope untouched.

## From the change's design.md

# Design

All in `parseField` (`src/scheduler/cron.ts`); every caller
(`resolveCadence` → `parseCron`, `getNextCronDate` from the store's
`create` / `setStatus("active")` / `claimRun`) goes through it, so one guard
covers `/schedule create`, resume and the tick.

- After the step is read, a step below 1 throws `CadenceError`
  (`Invalid cron step in "PART": the step must be 1 or more.`) before either
  loop. `CadenceError` is what the `/schedule create` handler already turns
  into an ephemeral reply, and `resolveCadence` calls `parseCron` outside
  `validateAndResolveCadence`'s try, so the message reaches the owner as is.
  This refuses every zero step, including `n/0` on a single value, which
  never looped but has no meaning as a step.
- The range loop runs to `Math.min(end, max)` instead of `end`. Values past
  the field's maximum were never matched by `getNextCronDate`, so every
  cadence accepted today resolves to the same string and the same run times;
  only the huge-end and past-2^53 forms change, from a hang to an immediate
  result that the existing rules then judge (5-minute gap, or "no matching
  cron date within 366 days").
- The `*` loop is already bounded by the field's maximum once the step is 1
  or more; a start is never negative (it is split on `-`), a step is digits
  only, and a step too large for a number (`Infinity`) ends the loop at once.
  `getNextCronDate` stays bounded by its 366-day window (a cadence that never
  matches scans ~527k minutes in ~0.15 s and throws).
- No refusal is added for out-of-range bounds (`0-60`, `99 * * * *`): the
  smallest change that ends the hang, listed as a design choice for Leif.

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
