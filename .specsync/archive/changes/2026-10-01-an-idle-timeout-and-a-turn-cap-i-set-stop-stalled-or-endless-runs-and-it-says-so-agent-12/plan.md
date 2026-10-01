---
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
artifact: plan
---

# Plan

1. No `hi` capture (AGENT-12 is already on main); `hi check`.
2. `src/agent/limits.ts`; `TaskStopReason`, `ExecuteResult.stopReason`,
   `TaskResult.stopReason` / `error`, `RunTaskOptions.idleTimeoutMs`.
3. `runTask` watchdog + result mapping; execute.ts turn-cap default,
   soft-land `stopReason`, model-call hold.
4. Activity: CLI events, verify-lane pipes, `spawnCapped`. Holds: workers,
   Approve-card waits.
5. Surfaces: `formatTaskPlumbing`, Discord client + bridge / session / work,
   WATCH client + poller + summary, CLI text line, `--help`, `.env.example`.
6. `tests/agent.limits.test.ts` with the fake LLM; fail-on-base proof (swap
   the base's modified sources in with `src/agent/limits.ts` kept, run,
   restore, run again).
7. Docs (README, docs/DISCORD-GO-LIVE.md E.10, docs/discord.md,
   docs/WATCH.md), spec prose, deltas, module testing evidence.
8. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
