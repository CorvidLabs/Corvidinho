---
change: flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai
artifact: design
---

# Design

- `src/agent/tier.ts` — read|tool|code (AGENT-5); filter plugin minTier.
- `src/agent/tools.ts` — plugins → OpenAI tool defs; argv parse; filesChanged harvest.
- Upgrade `src/agent/execute.ts` — when key + tier≠read: chat↔tool loop via `runPlugin`
  (SAFE-1 non-interactive default); emit ToolCall/ToolResult; AbortSignal between rounds.
- Extend `AgentEvent` with ToolCall/ToolResult.
- CLI `--tier` + `CORVIDINHO_LLM_TIER`; wire allowlist/cwd/onEvent into createTaskExecute.
- Fixture tests mock fetch (no live API key).
- Honest MVP gaps noted on STATUS/issue: no AGENT-6/7, no streaming, no mid-run escalation.
