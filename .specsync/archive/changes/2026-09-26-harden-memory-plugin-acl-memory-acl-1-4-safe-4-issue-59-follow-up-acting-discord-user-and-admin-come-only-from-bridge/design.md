---
change: harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge
artifact: design
---

# Design

- `src/memory/confirm.ts` — `issueConfirmToken(db, binding)` /
  `checkConfirmToken(db, token, binding)`. Token `mc1.<expiresAt>.<turn>.<hmac>`;
  HMAC-SHA256 over `[op, actor, memoryId, updatedAt, sha256(content)|"", expiresAt, turn]`
  with a 32-byte secret created on first use via
  `INSERT OR IGNORE INTO schema_meta ('memory_confirm_secret', …)`.
  `turn` = a random id per process (each Discord message and each CLI
  `plugins run` is a new process; one tool loop is one process), with a
  `setConfirmTurnForTests` seam like `setRequesterPermCheckerForTests`.
  Check order: shape → HMAC (timing-safe) → expiry → same-turn.
- `plugins/memory/commands.ts` — reject identity/path flags first; actor from
  env; `actingIsAdmin(env, userId)` loads the allowlist (deny list) at handler
  time; store opened from env data dir only (`CORVIDINHO_DATA_DIR` /
  `CORVIDINHO_MEMORY_INMEM` test seam).
- `src/discord/agent-client.ts` / `src/watch/agent-client.ts` — env hygiene only.
- No store/schema change; `MemoryStore.forget/override` keep their `isAdmin`
  parameter (now fed by the handler-time check).
