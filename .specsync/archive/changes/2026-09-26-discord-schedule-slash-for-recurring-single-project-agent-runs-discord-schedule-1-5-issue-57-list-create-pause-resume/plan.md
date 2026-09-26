---
change: discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume
artifact: plan
---

# Plan

1. Extend shared SQLite schema with `schedules` + `schedule_runs` (v2 migrate).
2. Add `src/scheduler/` — cron/cadence parse + 5m min validation, ScheduleStore,
   cooperative SchedulerService (60s tick, max concurrent, async fire).
3. Add `/schedule` slash body + handler (list open; mutations ADMIN re-check)
   and wire into dispatch + SlashContext + bridge (start/stop ticker;
   keep durable SessionStore from #61).
4. Fixture tests: cadence/min-interval, CRUD admin gates, tick doesn't block,
   allowlist on channel post target.
5. Spec delta REQ-discord-020; update docs/STATUS/CHANGELOG; register-commands
   count 7.
6. SpecSync approve → check → implement → verify → review → finalize → PR via gh.
