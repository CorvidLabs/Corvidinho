---
change: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
artifact: research
---

# Research

- `src/agent/execute.ts` (main): `loadLlmEnv` → single model; `run()` →
  `opts.tier ?? llm.tier`, `llm: { ...llm, tier }`; `body.model = opts.llm.model`.
- `src/agent/spend.ts`: `modelFromRequestBody` prices the request's model.
- `src/autonomous/delegate.ts` `buildDelegateSpawn`: forwards env minus
  Discord/GitHub tokens, audit key, `CORVIDINHO_ACTING_*`; forces
  `CORVIDINHO_LLM_TIER` and `--tier`. Council voices use the same spawn.
- Callers of `loadLlmEnv(...).model` without a tier: `src/version.ts`
  (`/status`), `src/discord/bridge.ts`, `src/discord/command-handlers/{session,work}.ts`,
  `src/cli.ts` doctor spend check — unchanged (env tier).
