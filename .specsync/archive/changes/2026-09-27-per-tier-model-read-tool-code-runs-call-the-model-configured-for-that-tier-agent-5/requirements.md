---
change: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
artifact: requirements
---

# Requirements

- Modified REQ-agent-007: the request model is the run tier's model.
- Modified REQ-agent-009: the effective tier (`--tier` over the env) also picks the model.
- Added REQ-agent-079: per-tier model resolution — `CORVIDINHO_LLM_MODEL_<TIER>`
  → `CORVIDINHO_LLM_MODEL` → `gpt-4o-mini`; override precedence; shared
  endpoint / key; delegate and council children resolve at their own tier;
  SAFE-8 pricing follows `body.model`; no key echo; unchanged without per-tier keys.
- Modified REQ-cli-009: help documents the per-tier keys; doctor `[ok] llm`
  names each tier's model when any per-tier key is set.

See `deltas/agent.md` and `deltas/cli.md`.
