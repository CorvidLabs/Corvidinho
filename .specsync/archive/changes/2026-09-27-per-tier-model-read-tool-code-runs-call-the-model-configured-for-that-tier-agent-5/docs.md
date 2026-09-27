---
change: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
artifact: docs
---

# Docs

- `bun src/cli.ts --help`: new line `CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE  optional model per tier (AGENT-5; else CORVIDINHO_LLM_MODEL)`.
- `.env.example`: commented `CORVIDINHO_LLM_MODEL_READ=` / `_TOOL=` / `_CODE=` under the LLM block (same endpoint + key).
- `doctor`: `[ok] llm` appends `; per tier: read …, tool …, code …` when any per-tier key is set.
