---
change: discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still
artifact: context
---

# Context

Issue #85 (AGENT always verify): Discord and WATCH still spawn
`task run --no-verify`, so chat/ingress never hits prove-before-done
(AGENT-4 / FLEDGE-2). Captured HI already requires the verify lane before
claiming done; draft AGENT-14/15 stay out of scope. Empty `filesChanged`
already skips the gate in the agent loop. CLI `--no-verify` remains for
local/operator opt-out. Package **0.0.13** (0.0.12 already used by #145/#142).
