---
module: cli
change: discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still
---

# Delta — cli (bridges no longer skip verify)

## Modified

### REQUIREMENT REQ-cli-007

`corvidinho task run` SHALL drive the prove-before-done loop with an injectable
execute path: demo stub when no LLM key is configured; thin env-gated
OpenAI-compatible chat when `CORVIDINHO_LLM_API_KEY` (or documented fallback) is
set. `--no-verify` remains for **local/operator opt-out only** — Discord and
WATCH bridges MUST NOT pass it (REQ-discord-085 / REQ-watch-085 / AGENT-4).
`--json` / `--output ndjson` emit structured result+events for callers to parse.
Package version after this change is **0.0.13**.

Acceptance Criteria
- Help still documents `task run` / `--no-verify` / `--json` / `--output`.
- Without LLM key, demo execute behaves as before (verify gate exercise).
- Help / fledge.toml no longer tell bridges to pass `--no-verify` for latency.
- Package `0.0.13`.

## Added

### REQUIREMENT REQ-cli-085

The CLI SHALL keep `--no-verify` as an explicit local skip of prove-before-done
(AGENT-4). Product bridges (Discord HEAR, GitHub WATCH) SHALL NOT use that flag
(REQ-discord-085 / REQ-watch-085). Removing the flag entirely (draft AGENT-14)
awaits HI capture. Package **0.0.13**.

Acceptance Criteria
- `corvidinho task run --no-verify --json` still exits 0 with `verifySkipped`.
- Bridge spawn clients do not pass `--no-verify` (covered under discord/watch).
