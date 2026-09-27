---
change: safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin
artifact: context
---

# Context

Scoping record w10 rank 6 (SAFE-5). On main (fbaa84b)
`handleDelete` in `src/discord/command-handlers/schedule.ts` called
`ctx.scheduleStore.delete`, which deletes the schedule's `schedule_runs` rows
and its `schedules` row (`src/scheduler/store.ts`), and wrote nothing to the
SAFE-5 audit chain. `grep -i audit src/discord/command-handlers/` found only
`admin.ts` and `status.ts`. `/admin` already records its mutations (intent
first, fail closed when the trail is unavailable, REQ-discord-043).

Repro on main: a DB-backed `ScheduleStore` with one schedule and one run, the
owner runs `/schedule delete schedule:<id>` with `recordAudit` wired to that DB:
the schedule and its run are gone and `audit_log` has 0 rows. With
`recordAudit` throwing, or unset, the delete still goes through.

Captured HI (`hi/safe.md`): "SAFE-5 Destructive actions leave a
tamper-evident audit trail I can verify later."

Constraints: smallest slice; no new env var, config key, slash command,
option or schema change (the chain table already exists, schema v5); no
package bump or CHANGELOG version section. Open PRs #232 (ask-button actor
gate + mute/rate) and #233 (SAFE-3 clamp) are out of scope and untouched.
No open issue tracks SAFE-5 (#95, which shipped the chain, is closed).
