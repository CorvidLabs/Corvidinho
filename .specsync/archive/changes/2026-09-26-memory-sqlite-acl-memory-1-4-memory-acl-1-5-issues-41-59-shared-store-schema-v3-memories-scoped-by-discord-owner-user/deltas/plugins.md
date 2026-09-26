---
module: plugins
change: memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user
---

# Delta — plugins (memory-* commands)

## Added

### REQUIREMENT REQ-plugins-010

Corvidinho SHALL register memory plugins `memory-store`, `memory-recall`,
`memory-forget`, and `memory-override` (PLUGIN-1 memory surface) backed by
shared-store `MemoryStore` (REQ-discord-021).

`memory-store` / `memory-recall` are safe. `memory-forget` / `memory-override`
are dangerous and SHALL require an explicit `--confirm` argv (SAFE-4) plus
ADMIN identity at handler time (MEMORY-ACL-3/4). Acting Discord user id comes
from `--user` or `CORVIDINHO_ACTING_DISCORD_USER_ID`. Admin flag from
`--admin` or `CORVIDINHO_ACTING_IS_ADMIN=1` only after call-site
`resolvePermissionLevel` (empty admin ⇒ never set).

Acceptance Criteria
- `plugins list` shows the four memory commands with danger markings.
- Store/recall work for acting user scope without admin.
- Forget/override without `--confirm` or without admin refuse.
- Non-admin cross-user forget refuses without leaking content.
- Builtins load memory plugins; fixture tests without live Discord.
