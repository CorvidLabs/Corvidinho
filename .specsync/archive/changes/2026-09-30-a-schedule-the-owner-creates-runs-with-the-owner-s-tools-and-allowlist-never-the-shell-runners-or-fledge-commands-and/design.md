---
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
artifact: design
---

# Design

- **Live owner** (`src/scheduler/service.ts`): `SchedulerServiceOpts.loadOwner`
  (sync or async); `liveOwner()` calls it per run (else `opts.owner`; a throw
  is logged and is no owner). `roleOf(userId, owner = this.owner)` and
  `answerBlock(answered, owner)` take the owner to judge against.
- **Stamp** (`runOne`): after `gateTick`, `liveOwner()`, then the creator's
  role against it; `byOwner = creatorRole === "owner" &&
  isOwnerDiscord(liveOwner, createdByUserId)` decides both the SAFE-12 prompt
  shape (as before) and `actingIsAdmin`. No `actingRole` is passed, so the
  spawn client never stamps team. Surface and session id unchanged.
- **Wiring**: the bridge passes `loadOwner: () => loadOwnerConfig({ env,
  filePath: config.allowlist.sourcePath })` (the same source its start-time
  owner came from); the daemon `loadOwner: () => loadOwnerConfig({ env })`.
- **Tool layer** (`src/plugins/roles.ts`): in `resolveActingRole`, after the
  ADMIN re-check and the community cap, a scheduled run returns community, so
  no stamp gives a schedule team.
- **Task run** (`src/agent/execute.ts`): Fledge discovery also needs
  `!isScheduleRunEnv(env)`. In `runToolLoop`, right after an offered call's
  `ToolResult`, `mustAskRefusedAsk(name, result)` (new in `src/agent/ask.ts`)
  in a scheduled run ends the run with `askExecuteResult`, after one operator
  Text line.
- **Not changed**: the must-ask gate and its card kinds, the SAFE-3.a gate,
  the scheduler's ask recording / delivery / wait notes (the new ask is an
  ordinary run ask), the schedule's own posts (never through `runPlugin`),
  the worktree manager (non-git projects keep their scoped folder), the
  schema.
