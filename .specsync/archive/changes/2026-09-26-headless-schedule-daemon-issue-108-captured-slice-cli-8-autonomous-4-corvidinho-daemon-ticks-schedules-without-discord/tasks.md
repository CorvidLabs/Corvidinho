---
change: headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord
artifact: tasks
---

# Tasks

- [x] ScheduleStore: refresh, claimRun compare-and-set, column-scoped writes
- [x] SchedulerService: refresh + claim in tick, finish once, onRunFinished, drain, abandonInFlight
- [x] src/daemon: lock, JSON logger, startDaemon / runDaemon
- [x] CLI `daemon` hook + help line
- [x] Fixture tests (daemon, daemon CLI, scheduler claim)
- [x] docs/DAEMON.md with systemd unit + README pointer
- [x] Spec deltas REQ-cli-108 / REQ-discord-108; cli spec files list
- [x] SpecSync check + tsc + bun test + fledge verify
