---
change: safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm
artifact: requirements
---

# Requirements

### REQ-plugins-005
Default-deny allowlists: empty/missing allow entries refuse targeted GitHub plugin runs and Discord listen/post checks (ALLOW-1..5, GITHUB-6, DISCORD-5). Deny overrides always win. Never treat empty as Merlin BASIC allow-by-default.

### REQ-plugins-006
Allowlists load from bot-VM config file (`CORVIDINHO_ALLOWLIST_FILE` or `~/.config/corvidinho/allowlist.toml|json`) with env overlays (ALLOW-4). Secrets stay in env.

### REQ-plugins-007
Discord allowlist stub API: channel / role / user checks for future HEAR (#5). No full Discord bridge in this change.

### REQ-cli-005
CLI/help/STATUS/README document how to set allowlists on the bot VM; wallet lane deferred (WALLET-1..3 docs/HI only).
