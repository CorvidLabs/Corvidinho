---
change: fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord
artifact: plan
---

# Plan

1. Add spawn-argv + execute modules; wire protocol + agent clients + CLI.
2. Fixture tests for argv + JSON summary + execute stub.
3. Spec deltas (discord/watch/agent/cli); .env.example + STATUS.
4. File dogfood issue for full LLM tool loop.
5. `specsync change check --commit` → review → ship → PR → merge when green.
