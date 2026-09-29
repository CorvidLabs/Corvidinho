---
change: scheduler-refuses-a-zero-cron-step-0-a-b-0-n-0-as-a-cadenceerror-and-bounds-cron-ranges-at-the-field-maximum-so
artifact: tasks
---

# Tasks

- [x] Reproduce on `0f2e2c2`: `*/0`, `0-59/0`, `0,*/0`, `0-99999999999`, `0 0-99999999999/2` and a past-2^53 range hang `validateAndResolveCadence` (killed by `timeout`).
- [x] Regression tests in a child bun with a 10 s timeout: zero steps in every field (cron unit + `/schedule create` handler), huge and past-2^53 ranges, `5/0` in-process, unchanged cadences; new cases fail on main (10 fail) and pass here.
- [x] `parseField` refuses a step below 1 as a `CadenceError` before expanding, and bounds the range loop at the field maximum.
- [x] Delta modifies REQ-discord-020 (full text plus two AC bullets); spec invariant and Error Cases row; `specs/discord/testing.md` section.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
