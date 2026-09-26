---
change: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
artifact: requirements
---

# Requirements

SAFE-1 (no arbitrary code exec without consent), SAFE-2 (protected project infra), ALLOW-4 (config only from the bot VM env). Modified REQ-agent-133 (spawn isolation now pins Bun config) and Modified REQ-plugins-083 (SAFE-2 list adds `bunfig.toml` / `.bunfig.toml`).
