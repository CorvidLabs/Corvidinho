---
change: discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume
artifact: research
---

# Research

Ancestor (archived corvid-agent):
- `server/discord/command-handlers/schedule-commands.ts` — list/create/pause/resume/delete/templates; admin on mutations
- `server/scheduler/cron-parser.ts` + `service.ts` `validateScheduleFrequency` (MIN 5m)
- ADR `docs/decisions/001-autonomous-scheduler.md` — 60s tick, min 5m cron, MAX_CONCURRENT=2, no catch-up
- Schema evolved to `agent_schedules` / `schedule_executions` — Corvidinho thin: single-project work_task only

Skip: templates, pipeline, flock, council, on-chain, ProcessManager, REST/MCP surfaces.

Corvidinho: durable SessionStore already on main (#61); reuse shared DB file.
