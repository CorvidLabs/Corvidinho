---
module: plugins
change: dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community
---

# Delta — plugins (ROLES-CHAT-8 public GitHub + secret paths)

## Modified

### SPEC SECTION Invariants

Non-ADMIN role sessions (`CORVIDINHO_ACTING_IS_ADMIN` set and not admin) may
call GitHub read tools against any *public* repository after deny-list checks
(ROLES-CHAT-8). Private or unknown visibility is refused. ADMIN / non-role
sessions keep the GITHUB-6 allowlist gate.

`files-read` refuses secret-looking paths (`.env*`, `.ssh`, keystores, key
files) for non-ADMIN role sessions via `isSecretPath`.

### SPEC SECTION Change Log

| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: ROLES-CHAT-8 community public GitHub gate + secret-path read refuse |
