---
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
artifact: tasks
---

# Tasks

- [x] Confirm AGENT-11 on main and #80 as the tracking issue; nothing to capture.
- [x] `src/agent/providers.ts`: `modelChain`, `callChain`, `ModelFailure` reasons, note / event / log / footer-label helpers, validators, `mergeModelFallbacks`, `addModelUsage`.
- [x] `src/agent/execute.ts`: `Completion.failure` (`SpendCapRefusal` and abort are `null`), `callModels`, one chain per `createTaskExecute`, image retry before failover, worker hops, the closing note; `onModelFallback`, `onModel`, per-model `onUsage`.
- [x] `TaskResult.model` / `usageByModel` / `modelFallback`; NDJSON usage frame `model` / `byModel`; `closingNotesTail` in `clipKeepingRoleNote`; `task run` wiring.
- [x] Delegate / council outcomes and plugin `data.modelFallback`.
- [x] Discord spawn client fields and `llm.fallback` line; footer `answerModelFor` and per-model `answerSpendFor` at every call site; split keeps the note; WATCH client line; daemon `llm.fallback` event.
- [x] `tests/agent.fallback.test.ts`; fail-on-base proof recorded in testing.md.
- [x] Docs (`.env.example`, README, DISCORD-GO-LIVE, discord, DAEMON, WATCH), spec prose, deltas and module testing evidence; the "only the first entry is called" note removed.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
