---
module: cli
change: flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai
---

# Delta — cli (task run tool loop / --tier)

## Added

### REQUIREMENT REQ-cli-009

The CLI SHALL accept `--tier read|tool|code` for `task run` (and SHALL honor `CORVIDINHO_LLM_TIER`) and SHALL wire `createTaskExecute` with cwd, non-interactive mode, allowlist, and event forwarding so Discord/WATCH/`task run` callers share the same LLM plugin tool loop. Bridges SHALL keep `--no-verify` available for latency; the verify gate SHALL remain available when not skipped.

Acceptance Criteria
- Help documents `--tier` and LLM env vars (no secrets).
- task run forwards ToolCall/ToolResult when not `--json`.

## Modified

### REQUIREMENT REQ-cli-007

`corvidinho task run` SHALL drive the prove-before-done loop with an injectable execute path: demo stub when no LLM key is configured; when `CORVIDINHO_LLM_API_KEY` (or documented fallback) is set, OpenAI-compatible execute including the plugin tool loop (tier tool|code) or read-tier chat. `--no-verify` remains for bridge latency. `--json` emits structured result+events for Discord/WATCH callers to parse.

Acceptance Criteria
- Help still documents task run / --no-verify / --json / --tier.
- Without LLM key, demo execute behaves as before (verify gate exercise).
- With key env documented in `.env.example` (no secret values).

### SPEC SECTION Purpose

Operator surface includes Discord HEAR, GitHub WATCH, attribution, and task run with optional LLM plugin tool loop.

### SPEC SECTION Invariants

task run honors --no-verify, --tier, and agent config; bridges may skip verify for latency.
plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count.
Attribution output uses only the project name and repository link and contains no account handle.

### SPEC SECTION Change Log

task run LLM tool loop + --tier (#31) (2026-09-26, corvid-agent).
