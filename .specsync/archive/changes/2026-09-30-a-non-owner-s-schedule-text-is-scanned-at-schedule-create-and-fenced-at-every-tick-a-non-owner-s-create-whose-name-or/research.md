---
change: a-non-owner-s-schedule-text-is-scanned-at-schedule-create-and-fenced-at-every-tick-a-non-owner-s-create-whose-name-or
artifact: research
---

# Research

Where a schedule's text enters a run or is written:

| Path | Text | Before | After |
|---|---|---|---|
| `/schedule create` (owner) | `name`, `prompt` (description is fixed) | stored as typed | unchanged: never scanned (the principal's words) |
| `/schedule create` (anyone else) | `name`, `prompt` | quiet ephemeral `NOT_AUTHORIZED` (ADMIN is owner-only), owner never told | injection → private refusal, one owner ping post, `denied` row, nothing stored; otherwise `NOT_AUTHORIZED` as before |
| `/schedule pause` / `resume` / `delete` | no text | — | unchanged (no edit path exists) |
| Tick, owner's schedule | stored name + prompt | raw in the prompt | unchanged |
| Tick, anyone else's schedule | stored name + prompt | raw in the prompt | scanned; a hit runs nothing and pauses with one owner ask; else fenced with the creator's role |
| Schedule ask answers (AUTONOMY-6.a) | — | not built on main | nothing to fix |

How a stored non-owner schedule exists on main: schedules created while
admin user / role lists still granted ADMIN (before IDENTITY-2), a creator
who was the owner when they created it (`[owner]` changed since), rows
written by another process on the shared data dir. The tick already
re-checks the creator against the live allowlist (DISCORD-SCHEDULE-3), so the
role is resolved there too with `resolveDiscordActingRole` (no Discord role
ids at a tick: a team member allowlisted only by a Discord role reads as
community — conservative, and the DISCORD-SCHEDULE-3 gate refuses such a
creator anyway when the user list is non-empty).

Owner note at tick: the existing REQ-discord-353 "run could not start" path
(`finish` with a stuck ask, then `postOwnRunAsk`) already records the ask on
the run row, pings the owner once per question (`askPingKey`), is left
pending by the daemon and delivered by a bridge tick. Reused as is; pausing
the schedule makes it one note (a skip that kept ticking would post the same
stuck ask every tick and auto-pause only after five).

The detector (`detectInjection`) and fence (`fenceUntrustedData` via
`fenceSpeakerText`) are reused unchanged; `auditInboundInjection` writes the
row.
