---
change: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
artifact: design
---

# Design

- Three optional env keys, one per tier (`CORVIDINHO_LLM_MODEL_READ`,
  `_TOOL`, `_CODE`), each falling back to `CORVIDINHO_LLM_MODEL`, then the
  existing `gpt-4o-mini` default. Chosen as the most conservative shape that
  meets AGENT-5: optional, today's behaviour when unset, same env-only
  configuration style as the other LLM keys, no config-file or slash surface.
  **Pending Leif:** env keys vs a tier map in `CORVIDINHO_LLM_MODEL` or a
  `fledge.toml` key.
- Endpoint and key stay shared by all tiers. **Pending Leif:** whether a tier
  should also pick its own endpoint / key (e.g. local Ollama for read, hosted
  API for code) — a follow-up slice.
- Resolution lives in `modelForTier` (`src/agent/tier.ts`); `loadLlmEnv(env, tier?)`
  takes the explicit tier so `--tier` re-resolves the model (main spread
  `{ ...llm, tier }` and kept the env tier's model).
- SAFE-8 needs no change: `createSpendGuard` prices `body.model`, which is now
  the tier's model.
- Delegate / council children already get `--tier` plus the inherited env; the
  per-tier keys are not in the worker drop list, so a read-tier child resolves
  the read model with no delegate change.
- Callers without a tier (`/status`, Discord thinking footer, doctor `spend`)
  keep `loadLlmEnv(env).model`, i.e. the env tier's model, which is what a
  bridge run (no `--tier`) calls.
