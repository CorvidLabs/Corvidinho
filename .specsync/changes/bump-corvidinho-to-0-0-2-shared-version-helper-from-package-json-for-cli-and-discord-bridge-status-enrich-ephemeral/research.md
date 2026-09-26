---
change: bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral
artifact: research
---

# Research

- Hardcoded `BRIDGE_VERSION = "0.0.1"` in `bridge.ts` and `VERSION` in `cli.ts` already noted as sync risk.
- `#32` added `loadLlmEnv` — reuse for status LLM line without inventing provider HI.
- Six slash names already exported as `SLASH_COMMAND_NAMES` (session/status/agents/work/mute/unmute).
