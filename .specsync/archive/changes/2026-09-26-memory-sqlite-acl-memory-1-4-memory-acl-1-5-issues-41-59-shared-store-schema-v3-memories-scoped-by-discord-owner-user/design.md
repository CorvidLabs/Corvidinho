---
change: memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user
artifact: design
---

# Design

## Schema v3 (shared `corvidinho.db`)

Table `memories`:
- `id` TEXT PK
- `owner_user_id` TEXT NOT NULL (Discord user snowflake)
- `category` TEXT NOT NULL — `conversation` | `entity` | `person` | `personality`
- `key` TEXT NOT NULL (short label within owner+category)
- `content` TEXT NOT NULL
- `created_at` / `updated_at` INTEGER
- `deleted_at` / `deleted_by_user_id` — soft-delete for ACL audit

Unique active key: `(owner_user_id, category, key)` WHERE `deleted_at IS NULL`.

## MemoryStore (`src/memory/`)

- `store` / `recall` — default scope = acting owner only (MEMORY-ACL-1)
- `forget` / `override` — require `isAdmin === true` even for own memories
  (MEMORY-ACL-3/4); empty admin ⇒ callers pass false ⇒ deny-all
- Non-admin cross-user attempts refuse with opaque error (no content leak)
- Soft-delete on forget; override updates content when ADMIN

## Plugins (`plugins/memory/`)

- `memory-store`, `memory-recall` (safe)
- `memory-forget`, `memory-override` (dangerous + `--confirm` for SAFE-4)
- Acting user from `--user` or `CORVIDINHO_ACTING_DISCORD_USER_ID`
- Admin re-check via `--admin` / `CORVIDINHO_ACTING_IS_ADMIN=1` only after
  call-site `resolvePermissionLevel`

## Bridge

`startBridge` opens shared DB → `MemoryStore`; Discord spawn sets acting-user
env. **No new slash commands.**

## Version

Bump `package.json` to **0.0.4** so Discord presence (DISCORD-12) reads the
new version after restart.

## Spec ownership

- `src/memory/*` + store schema under **discord** (like store/scheduler)
- `plugins/memory/*` under **plugins**
- version bump under **cli**

## Out of scope

Slash `/memory`, on-chain/Trust/Augur, Merlin memory plugin, FTS/embeddings,
ProcessManager, inventing HI.
