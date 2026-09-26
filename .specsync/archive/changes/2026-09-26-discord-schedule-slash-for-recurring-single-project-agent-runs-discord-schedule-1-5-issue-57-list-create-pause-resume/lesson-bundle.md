# Lesson bundle — discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord /schedule slash for recurring single-project agent runs (DISCORD-SCHEDULE-1..5 / issue #57): list create pause resume delete; admin mutations; 5m min interval; steal corvid-agent schedule-commands + scheduler; ticks must not starve HEAR/WATCH ingress; no flock/council/templates/on-chain
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/slash-commands.ts, src/discord/slash-dispatch.ts, src/discord/slash-types.ts, src/discord/command-handlers/schedule.ts, src/discord/bridge.ts, src/discord/index.ts, src/discord/register-commands.ts, src/scheduler/, src/store/db.ts, src/store/index.ts, specs/discord/, tests/discord.schedule*.test.ts, tests/scheduler*.test.ts, STATUS.md, docs/discord.md, CHANGELOG.md
- **Acceptance**: Slash /schedule list|create|pause|resume|delete works (DISCORD-SCHEDULE-1..2); create takes human cadence (cron/@hourly/every Nh) + single project + prompt; mutations ADMIN re-check at handler (empty admin=deny-all); min interval 5m enforced; ticks respect channel/user allowlists+SAFE (DISCORD-SCHEDULE-3); scheduler tick cooperative so HEAR/WATCH ingress stays ≤~1m (DISCORD-SCHEDULE-4); steal corvid-agent schedule-commands/scheduler/db/ADR (no flock/council/templates/on-chain) (DISCORD-SCHEDULE-5); SQLite schedules in shared store; fixture tests; SpecSync+fledge verify green; Made with Corvidinho

## Evidence

- Verification commit: `ff9a6e2479d7d55664de348ad86cce401fda991a`
- Base commit: `64e3ee175f266a41f4b8181f43f1e70b01d2c396`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Leif confirmed DISCORD-SCHEDULE-1..5 (captured via #60 into `hi/discord.md`).
Impl issue #57. SESSION durable SQLite store landed on main via #61 (`64e3ee1`)
— Discord bridge must keep using that durable SessionStore/WorkStore.

Cut order: **schedule slash now, single-project first** (no pipeline templates,
flock, council, or on-chain). Steal from archived corvid-agent
`schedule-commands.ts`, `server/scheduler/`, `server/db/schedules*`, ADR
`docs/decisions/001-autonomous-scheduler.md`.

Standing constraints:
- ADMIN re-check at handler for mutations (DISCORD-7 / ADMIN-4); empty admin = deny-all
- Min cadence interval **5 minutes** (ADR + user cut note)
- Ingress (HEAR + WATCH ~60s) must stay ≤ ~1m — schedule ticks must not starve it
- Linux only; no invent AC beyond captured HI
- Made with Corvidinho attribution on PR/issue traffic

## From the change's design.md

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

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
