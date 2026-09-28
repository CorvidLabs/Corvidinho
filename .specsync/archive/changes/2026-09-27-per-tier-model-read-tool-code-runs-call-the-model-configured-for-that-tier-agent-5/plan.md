---
change: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
artifact: plan
---

# Plan

1. `src/agent/tier.ts`: `TIER_MODEL_ENV`, `DEFAULT_LLM_MODEL`, `modelForTier(env, tier)`.
2. `src/agent/execute.ts`: `loadLlmEnv(env, tier?)` resolves the tier (explicit
   over env) and its model; `run()` calls `loadLlmEnv(env, opts.tier)` and
   passes that `llm` to the read chat and the tool loop.
3. `src/agent/index.ts`: export the new helpers.
4. `src/doctor.ts`: `[ok] llm` appends `; per tier: read …, tool …, code …`
   only when a per-tier key is set. `src/cli.ts` help and `.env.example`
   document the keys.
5. Regression tests that fail on main; SpecSync deltas; verify lane.
