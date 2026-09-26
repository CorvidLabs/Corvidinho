---
change: identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake
artifact: research
---

# Research

- `src/discord/permissions.ts` `resolvePermissionLevel`: mute, deny, admin
  users/roles, allow users/roles, then empty-lists STANDARD. Call sites:
  `slash-dispatch.ts` (x2), `command-handlers/{session,schedule,work,announce}.ts`,
  `bridge.ts` (`actingIsAdmin` for MEMORY-ACL).
- `src/allowlist/load.ts`: `resolveAllowlistPath` (env file, then
  `~/.config/corvidinho/allowlist.{toml,json}`); `parseSimpleToml` returns
  lists only.
- Ancestor corvid-agent `server/db/discord-config.ts` kept the owner in a DB
  config row. Corvidinho keeps bot-VM config in file plus env (ALLOW-4), so the
  owner lives there instead. On-chain identity verification is not ported.
