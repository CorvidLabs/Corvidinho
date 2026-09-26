---
change: discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume
artifact: testing
---

# Testing

- Unit: cadence aliases → cron; reject <5m; accept exactly 5m / @hourly.
- Slash fixtures: list empty; create as admin; create as non-admin → not
  authorized; pause/resume/delete admin-only; empty admin deny-all.
- Channel on create: non-allowlisted channel refused.
- Scheduler: due schedule fires async; tick returns without awaiting agent;
  paused schedules skipped; max concurrent respected.
- Register-commands bodies include `schedule` (seven commands).
- `bun test`, `bunx tsc --noEmit`, `specsync check`, `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-009 | `tests/discord.slash.test.ts` + `tests/discord.schedule.test.ts` — bodies include schedule subcommands |
| REQ-discord-016 | `tests/discord.register-commands.test.ts` — guild PUT seven bodies then clear globals |
| REQ-discord-018 | `docs/discord.md` slash inventory includes `/schedule`; deny note mentions schedule mutations |
| REQ-discord-019 | `tests/discord.session-store.durable.test.ts` still green; shared DB schema v2 coexists |
| REQ-discord-020 | `tests/discord.schedule.test.ts` + `tests/scheduler.cron.test.ts` + `tests/scheduler.service.test.ts` — slash CRUD, 5m min, cooperative tick, allowlist |

## Automated coverage

- `bun test tests/discord.schedule.test.ts tests/scheduler.cron.test.ts tests/scheduler.service.test.ts tests/discord.register-commands.test.ts tests/discord.slash.test.ts tests/discord.session-store.durable.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`
