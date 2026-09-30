---
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
artifact: research
---

# Research

- Sources: issue #124 (M4 tracker and its three comments), Leif's interview
  record `/home/user/coord/interview-2026-09-28.md` (round 5
  DISCORD-SCHEDULE-1; round 13 owner schedules in non-git projects keep a
  separate folder), the slice record
  `/home/user/coord/pr-schedule-owner-role.json` and every schedules-owner row
  of `/home/user/coord/m34-defaults.md`.
- `runOne` (src/scheduler/service.ts) calls `gateTick`, resolves the
  creator's role (`resolveDiscordActingRole`, used for the SAFE-12 fence and
  SAFE-13 scan) and spawns with `actingIsAdmin: false`, `surface:
  "schedule"` and session `schedule_<id>`. The spawn client
  (src/discord/agent-client.ts) stamps `CORVIDINHO_ACTING_IS_ADMIN` and
  `CORVIDINHO_ACTING_ROLE` (`owner` only with `actingIsAdmin`, `team` only
  when asked, else `community`).
- The tool layer (`resolveActingRole`, src/plugins/roles.ts) gives owner only
  through the ADMIN re-check (bit + live owner + not muted / deny-listed);
  `runPlugin` gates mutating tools by role, then SAFE-1, then the must-ask
  gate (`mustAskGate`), whose refusal carries `data.refused`, `rule`,
  `class`, `outcome` (`denied`, `expired`, `resent`, `worker`, `no-owner`,
  `unavailable`, `aborted`), `why` and `request`.
- `createTaskExecute` discovers Fledge plugin commands when the role is owner
  (or no role session) and the allowlist names one; the SAFE-3.a gate already
  refuses scheduled runs (`isScheduleRunEnv` and the `schedule` surface).
- A run ending with `askExecuteResult` becomes `blocked` in `runTask`; the
  scheduler's `finish` records any run ask and it blocks the schedule
  (AUTONOMY-6.a), posting once and then one wait note per open ask.
- The bridge and the daemon each load the owner once at start
  (`loadOwnerConfig`); the file and env overlay are re-readable at any time.
- Non-git projects get `scoped-talk-*` folders from `ensureTalkWorkspace`; the
  scheduler passes no owner flag there, so owner schedules keep them.
