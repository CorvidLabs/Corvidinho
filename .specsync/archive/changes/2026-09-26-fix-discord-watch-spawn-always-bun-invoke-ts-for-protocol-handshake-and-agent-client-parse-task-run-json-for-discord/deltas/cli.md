---
module: cli
change: fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord
---

# Delta — cli (task run execute hook)

## Modified

### REQUIREMENT REQ-cli-007

`corvidinho task run` SHALL drive the prove-before-done loop with an injectable
execute path: demo stub when no LLM key is configured; thin env-gated
OpenAI-compatible chat when `CORVIDINHO_LLM_API_KEY` (or documented fallback) is
set. `--no-verify` remains for bridge latency. `--json` emits structured
result+events for Discord/WATCH callers to parse.

Acceptance Criteria
- Help still documents task run / --no-verify / --json.
- Without LLM key, demo execute behaves as before (verify gate exercise).
- With key env documented in `.env.example` (no secret values).
