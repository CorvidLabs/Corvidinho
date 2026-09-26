---
change: harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge
artifact: research
---

# Research

- `src/agent/execute.ts` tool loop: `argvFromToolArguments` → `runPlugin(name,
  argv)`; argv is fully model-controlled, env is not. So identity/ADMIN must
  never be read from argv.
- `src/agent/tools.ts`: non-dangerous plugins with `minTier <= tier` are in the
  catalog by default → `memory-store`/`memory-recall` (minTier 0) are always
  model-reachable.
- `src/discord/config.ts`: admin lists come only from
  `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES` env, which the spawned agent
  inherits — so the handler can re-check user-id admins itself; role admins
  need the bridge's per-dispatch bit.
- Precedent for test seams: `setRequesterPermCheckerForTests` (plugins/discord).
- PR #70 bumps schema to v4 and takes REQ-discord-022 — avoid both.
