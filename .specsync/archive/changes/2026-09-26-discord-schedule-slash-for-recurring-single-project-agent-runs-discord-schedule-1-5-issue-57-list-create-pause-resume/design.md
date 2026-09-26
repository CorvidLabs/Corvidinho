---
change: discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume
artifact: design
---

# Design

## Slash `/schedule`

Subcommands: `list`, `create`, `pause`, `resume`, `delete`.

Create options (single-project):
- `name` (required)
- `cadence` (required) — cron / `@hourly|@daily|@weekly|@monthly` / `every N minutes|hours`
- `project` (required) — one project path or name
- `prompt` (required) — work description for the agent run
- `channel` (optional) — Discord channel id for result post; must be allowlisted

Mutations: ADMIN re-check inside handler (same pattern as ancestor; dispatch
does not set command-level minPermission so `list` stays open to allowlisted
users). Empty admin lists → deny-all.

## Persistence

Shared `corvidinho.db` schema v2:
- `schedules` (id, name, cron_expression, project, prompt, channel_id,
  created_by_user_id, status, execution_count, consecutive_failures,
  last_run_at, next_run_at, created_at, updated_at)
- `schedule_runs` (id, schedule_id, status, summary, error, started_at, completed_at)

## Scheduler

- Poll ~60s (`SCHEDULER_POLL_INTERVAL_MS`, default 60000)
- Min interval 5m (`MIN_SCHEDULE_INTERVAL_MS = 300_000`)
- Max concurrent executions default 2
- Tick lists due rows, starts async agent runs, returns immediately (does not
  await agent) so Discord gateway + WATCH poll stay responsive
- On fire: build prompt with project context; spawn via existing AgentClient;
  optional channel post after allowlist re-check
- Auto-pause after 5 consecutive failures (ADR steal)
- No catch-up on restart — recompute next_run_at from now

## Spec ownership

`src/scheduler/*` listed under discord module files for this change (same
pattern as `src/store/` in SESSION durable). Physical path stays reusable.
