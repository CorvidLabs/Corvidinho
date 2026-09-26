---
change: headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord
artifact: context
---

# Context

Issue #108 asks for "one supervised daemon". Only two of its ids are captured
in `hi/`: **CLI-8** (a daemon mode keeps schedules and long autonomous work
ticking without me babysitting a REPL) and **AUTONOMOUS-4** (schedule recurring
agent work and have a daemon tick it forward without an open REPL).
OPS-3..5 (one supervised process for bridge + watch + AlgoChat + scheduler,
self-restart, per-part heartbeat in `/status`, crash DM) are DRAFT and are
not built here.

Before this change, schedules ticked only inside `discord bridge`
(`SchedulerService` started in `src/discord/bridge.ts`). That command needs a
Discord token and a channel allowlist, so no schedule moved without Discord.
`github watch` does not tick schedules. Neither command is a daemon in the
CLI-8 sense.

Constraint found while scoping: `ScheduleStore` cached rows in memory and
wrote whole rows back. A second ticker process on the same data dir would
(a) never see schedules created later via `/schedule`, (b) double-fire due
runs (each process had its own `next_run_at`), and (c) overwrite a Discord
`/schedule pause` with a stale `status = active` when its run finished.
The daemon therefore needed a store fix as well as a new command.
