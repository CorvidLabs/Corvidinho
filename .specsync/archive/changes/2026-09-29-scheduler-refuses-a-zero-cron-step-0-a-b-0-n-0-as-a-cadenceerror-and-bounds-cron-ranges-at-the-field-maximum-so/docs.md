---
change: scheduler-refuses-a-zero-cron-step-0-a-b-0-n-0-as-a-cadenceerror-and-bounds-cron-ranges-at-the-field-maximum-so
artifact: docs
---

# Docs

- `specs/discord/discord.spec.md`: the `/schedule` invariant says a zero cron
  step is a `CadenceError` and ranges stop at the field maximum, so no
  cadence hangs `/schedule create`, the store or the bridge; new Error Cases
  row for the zero-step reply. Version and change log are left to
  `specsync change check --commit` (materialize).
- `specs/discord/testing.md`: new "Zero cron step never hangs /schedule
  create" section (REQ-discord-020, DISCORD-SCHEDULE-4).
- Operator docs unchanged: `docs/discord.md` already says "min 5m cadence" and
  no doc promised that a zero step or an out-of-range range works; README and
  `docs/DISCORD-GO-LIVE.md` do not describe cron syntax. No CHANGELOG/STATUS
  edit (bug-fix slice).
