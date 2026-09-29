---
change: scheduler-refuses-a-zero-cron-step-0-a-b-0-n-0-as-a-cadenceerror-and-bounds-cron-ranges-at-the-field-maximum-so
artifact: context
---

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
