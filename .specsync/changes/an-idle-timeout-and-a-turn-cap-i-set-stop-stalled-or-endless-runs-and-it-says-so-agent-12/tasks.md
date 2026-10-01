---
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
artifact: tasks
---

# Tasks

- [x] Confirm AGENT-12 is captured on main; nothing new to capture; `hi check` passes.
- [x] `src/agent/limits.ts`: env readers, lines, `stopReasonFromUnknown`, the watchdog and its AsyncLocalStorage hooks.
- [x] Types: `TaskStopReason`, `ExecuteResult.stopReason`, `TaskResult.stopReason` / `error`, `RunTaskOptions.idleTimeoutMs`; exports from `src/agent/index.ts`.
- [x] `runTask`: watchdog, combined signal, event / execute wrappers, idle-timeout and turn-cap result mapping.
- [x] `createTaskExecute`: `CORVIDINHO_MAX_TURNS` default, soft-land `stopReason`, model calls hold the watchdog (no other execute.ts region touched).
- [x] Activity from CLI events, verify-lane pipes and `spawnCapped`; holds in `runDelegateChild` and `ApprovalStore.waitForDecision`.
- [x] `formatTaskPlumbing` `stopped=…`; Discord client, bridge chat / ask paths, `/session start`, `/work`; WATCH client, poller, summary line; CLI text line, invalid-value note, `idleTimeoutMs`, `--help`, `.env.example`.
- [x] `tests/agent.limits.test.ts`; fail-on-base proof recorded in testing.md.
- [x] README, docs/DISCORD-GO-LIVE.md, docs/discord.md, docs/WATCH.md, spec prose, deltas and module testing evidence updated.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
