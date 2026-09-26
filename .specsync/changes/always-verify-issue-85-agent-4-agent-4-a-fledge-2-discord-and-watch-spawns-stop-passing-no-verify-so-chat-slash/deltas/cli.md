---
module: cli
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
---

# Delta — cli (--no-verify is operator-only, issue #85)

## Modified

### REQUIREMENT REQ-cli-006

The CLI SHALL expose `task run` with `--no-verify`, optional `--max-retries`, and `--json` TaskResult output so operators can exercise or skip the prove-before-done gate. `--no-verify` is operator-only: bridges SHALL NOT pass it, and a skipped run that changed files SHALL say `NOT verified` in its summary (AGENT-4).

Acceptance Criteria
- `corvidinho task run --no-verify --json` exits 0 with verify_skipped and a summary leading with `NOT verified:` (demo stub reports a change).
- Help documents `task run` and `--no-verify` as operator-only.

### REQUIREMENT REQ-cli-007

`corvidinho task run` SHALL drive the prove-before-done loop with an injectable execute path: demo stub when no LLM key is configured; when `CORVIDINHO_LLM_API_KEY` (or documented fallback) is set, OpenAI-compatible execute including the plugin tool loop (tier tool|code) or read-tier chat. `--no-verify` remains an operator escape hatch; Discord/WATCH callers run with the verify gate on. `--json` emits structured result+events for Discord/WATCH callers to parse.

Acceptance Criteria
- Help still documents task run / --no-verify / --json / --tier.
- Without LLM key, demo execute behaves as before (verify gate exercise).
- With key env documented in `.env.example` (no secret values).

### REQUIREMENT REQ-cli-009

The CLI SHALL accept `--tier read|tool|code` for `task run` (and SHALL honor `CORVIDINHO_LLM_TIER`) and SHALL wire `createTaskExecute` with cwd, non-interactive mode, allowlist, and event forwarding so Discord/WATCH/`task run` callers share the same LLM plugin tool loop. Bridges SHALL NOT pass `--no-verify`: a bridge run that changed files is held to the same verify gate as `task run` (AGENT-4 / FLEDGE-2).

Acceptance Criteria
- Help documents `--tier` and LLM env vars (no secrets).
- task run forwards ToolCall/ToolResult when not `--json`.
- Discord and WATCH spawn argv contain no `--no-verify`.
