---
id: scheduler-refuses-a-zero-cron-step-0-a-b-0-n-0-as-a-cadenceerror-and-bounds-cron-ranges-at-the-field-maximum-so
state: archived
type: bug_fix
base_commit: 0f2e2c2774635d1dcbdff599cba92dbecf8eebd9
---

# Scheduler refuses a zero cron step (*/0, a-b/0, n/0) as a CadenceError and bounds cron ranges at the field maximum, so /schedule create replies instead of hanging the bridge

## Intent

Scheduler refuses a zero cron step (*/0, a-b/0, n/0) as a CadenceError and bounds cron ranges at the field maximum, so /schedule create replies instead of hanging the bridge

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A cadence with a zero cron step in any field (*/0, a-b/0, n/0, also inside a comma list) is refused with a CadenceError naming the step before any loop, so /schedule create replies with that message ephemerally and creates nothing instead of hanging the bridge; parseCron and getNextCronDate (store create/resume/claim) throw the same CadenceError; a range whose end is past the field maximum (0-99999999999) is bounded at that maximum so it resolves at once and falls to the existing 5-minute rule; every cadence accepted today with a step >= 1 resolves to the same cron; regression tests run the hang forms in a child bun with a timeout and fail on main; no new env var, config key, command, option or schema change

## No-spec Rationale

Not applicable
