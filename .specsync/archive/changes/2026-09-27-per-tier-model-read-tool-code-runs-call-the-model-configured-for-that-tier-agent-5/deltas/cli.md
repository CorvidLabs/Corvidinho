---
module: cli
change: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
---

# Delta — cli (help and doctor name the per-tier models, AGENT-5)

## Modified

### REQUIREMENT REQ-cli-009

The CLI SHALL accept `--tier read|tool|code` for `task run` (and SHALL honor `CORVIDINHO_LLM_TIER`) and SHALL wire `createTaskExecute` with cwd, non-interactive mode, allowlist, and event forwarding so Discord/WATCH/`task run` callers share the same LLM plugin tool loop. Bridges SHALL keep `--no-verify` available for latency; the verify gate SHALL remain available when not skipped. The tier SHALL also select the model the run calls (REQ-agent-079). Help SHALL document the optional per-tier model keys `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`, and when any of them is set the doctor `[ok] llm` line SHALL name the model each tier calls (model names only, never the API key); with none set the line SHALL read as before.

Acceptance Criteria
- Help documents `--tier` and LLM env vars (no secrets).
- task run forwards ToolCall/ToolResult when not `--json`.
- Help lists `CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE`.
- With `CORVIDINHO_LLM_MODEL=big`, `_READ=cheap` and `_CODE=big2`, doctor prints `[ok] llm: … model big; per tier: read cheap, tool big, code big2` and exits 0 without the key value; with no per-tier key the line ends `model big`.
