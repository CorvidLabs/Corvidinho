---
change: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
artifact: tasks
---

# Tasks

- [x] Per-tier model resolution in `src/agent/tier.ts` + `loadLlmEnv(env, tier?)`.
- [x] `createTaskExecute` re-resolves the model after the `--tier` / `opts.tier` override.
- [x] Doctor `[ok] llm` names per-tier models (never the key); help + `.env.example` document the keys.
- [x] Regression tests in `tests/agent.tool-loop.test.ts`, `tests/autonomous.delegate.test.ts`, `tests/cli.doctor-truth.test.ts`, `tests/agent.cli.test.ts` fail on main and pass here.
- [x] Deltas: Modified REQ-agent-007 / REQ-agent-009 / REQ-cli-009, Added REQ-agent-079; spec testing notes.
- [x] `bunx tsc --noEmit`, `bun test`, `specsync check`, `fledge lanes run verify --non-interactive`.
