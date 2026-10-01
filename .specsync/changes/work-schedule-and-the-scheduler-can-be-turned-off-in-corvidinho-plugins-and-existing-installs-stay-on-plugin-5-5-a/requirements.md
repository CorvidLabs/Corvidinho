---
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
artifact: requirements
---

# Requirements

- PLUGIN-5 (captured, `hi/plugin.md`): "Autonomous extras (work tasks,
  councils, scheduling, …) are plugins I can leave disabled until I opt in."
- PLUGIN-5.a (captured, `hi/plugin.md`, Leif 2026-09-28 interview round 10):
  "/work and /schedule (and the scheduler) are extras I can turn off like the
  others; on an existing install they stay on until I turn them off."
- Round 10 decision: toggleable via `[corvidinho.plugins]` config (or
  /admin); default on. Config only here (no /admin knob: Round 10's ADMIN-3
  knob list does not include it).
- Kept: AUTONOMOUS-1 / SAFE-9 (`[corvidinho.autonomous]` unchanged and
  independent), DISCORD-7 / REQ-discord-201 / REQ-discord-010 (the channel,
  actor and mute/rate gates run first, their replies unchanged), AGENT-3.a
  (a run in flight stays stoppable), OPS-1/2 (backup on the tick),
  MEMORY-ACL-6 / SAFE-18..20 (cards on the tick), AUTONOMY-6.a /
  REQ-discord-347 (schedule asks delivered), SAFE-14.a (spend DMs),
  DISCORD-SCHEDULE-3/4 (no catch-up), DISCORD-10 (protocol unchanged).
- Added: REQ-agent-157 (the settings reader and its two-source rule),
  REQ-discord-157 (slash gate, `/work` talk gate, scheduler gate that keeps
  the tick's other jobs, bridge wiring and logs), REQ-cli-157 (the daemon's
  gate and its `schedules` field / events).
- No new env var, slash command, CLI command, /admin knob, table, column,
  schema version or protocol version. The new config keys are optional and
  default to today's behaviour (on).
