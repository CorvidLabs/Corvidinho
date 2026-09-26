---
change: bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral
artifact: context
---

# Context

Leif wants incremental versions and clearer Discord `/status` for dogfood on the
live bridge. `package.json` and hardcoded `BRIDGE_VERSION` / CLI `VERSION` are
still `0.0.1` and can drift. `/status` already shows version/uptime/protocol/
channels/sessions/work but omits LLM mode (model + host, never key), registered
slash names, and optional git tip — useful when restarting after pull.

Constraints: HI-first; no new slash commands; keep mute/unmute; do not steal
iced/voice/schedule (#9); secrets out of repo; SpecSync + fledge verify green.
