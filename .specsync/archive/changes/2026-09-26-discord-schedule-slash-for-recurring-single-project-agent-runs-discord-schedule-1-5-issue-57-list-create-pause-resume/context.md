---
change: discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume
artifact: context
---

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
