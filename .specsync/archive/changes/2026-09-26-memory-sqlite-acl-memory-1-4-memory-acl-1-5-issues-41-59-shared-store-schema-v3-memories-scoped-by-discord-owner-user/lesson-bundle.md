# Lesson bundle — memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: MEMORY SQLite + ACL (MEMORY-1..4 / MEMORY-ACL-1..5 / issues #41 #59): shared store schema v3 memories scoped by Discord owner_user_id; categories conversation/entity/person/personality; ADMIN-only forget/override including self-forget; empty admin deny-all; no slash commands; no on-chain; bump 0.0.4
- **Kind**: Feature
- **Specs**: discord, plugins, cli
- **Paths**: src/store/, src/memory/, plugins/memory/, src/discord/bridge.ts, src/discord/index.ts, src/discord/agent-client.ts, src/plugins/builtins.ts, specs/discord/, specs/plugins/, specs/cli/, tests/memory*.test.ts, STATUS.md, CHANGELOG.md, docs/BOX-UPDATE.md, docs/discord.md, package.json, src/version.ts
- **Acceptance**: Shared corvidinho.db schema v3 adds memories table (owner_user_id, category conversation|entity|person|personality, key, content, timestamps, soft-delete); MemoryStore CRUD scoped to acting Discord user (MEMORY-1..2/ACL-1); reload after reopen (MEMORY-4); local SQLite only no on-chain (MEMORY-3/ACL-5); non-admin cannot forget/override others without leaking content (ACL-2); ADMIN re-check at handler for forget/override of others AND self-forget; empty admin=deny-all (ACL-3/4 ADMIN-4 DISCORD-7); memory plugins (no new slash); fixture tests; package 0.0.4; SpecSync+fledge verify green

## Evidence

- Verification commit: `89f3d4c4a03bb0ef6f6ab76eb04019cd44cd1c05`
- Base commit: `7d81edc9d105fbea329e71deca99bfe05f100a27`
- Verified by: `specsync check --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

HI `hi/memory.md` MEMORY-1..4 + MEMORY-ACL-1..5 and `hi/admin.md` ADMIN-4 /
DISCORD-7 are captured. Shared SQLite (`src/store/`, schema v2 after schedules)
already at `~/.local/share/corvidinho/corvidinho.db`. Issues #41 (OPEN impl)
and #59 (MEMORY-ACL) ship together. #35 is closed duplicate.

Constraints:
- HI-first: do not invent slash `/memory` (not in hi/discord.md).
- Extend shared store schema (v3 memories) — no second DB; no on-chain/Trust.
- Memories scoped by Discord `owner_user_id`; forget/override (own or other)
  ADMIN-only at handler time; empty admin = deny-all; refuse without leaking.
- Steal corvid-agent local SQLite memory shape lightly; skip arc69/attestation.
- Bump package to 0.0.4 (Leif standing order: bump on meaningful feature ships).

## From the change's design.md

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

## From the change's testing.md

# Testing

- Store conversation/entity/person/personality; recall by owner/category.
- Soft-delete forget by ADMIN; non-admin self-forget denied; cross-user deny
  without leaking content.
- Empty admin ⇒ forget/override denied.
- Override by ADMIN updates content; reopen DB reloads (MEMORY-4).
- Schema version = 3 after migrate.
- Plugin list includes memory-* ; forget without --confirm / without admin fails.
- `corvidinho version` / package.json print 0.0.4.
- No live Discord; `bun test` + `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-019 | `tests/discord.session-store.durable.test.ts` still green; shared DB schema v3 coexists with SESSION |
| REQ-discord-021 | `tests/memory.store.test.ts` — schema v3, CRUD categories, ACL deny, admin forget/override, reload |
| REQ-plugins-010 | `tests/memory.plugins.test.ts` — list danger markings; store/recall; forget needs --confirm + admin |
| REQ-cli-011 | `tests/version.test.ts` + `tests/update-helpers.test.ts` — package.json / VERSION / CHANGELOG 0.0.4 |

## Automated coverage

- `bun test tests/memory.store.test.ts tests/memory.plugins.test.ts tests/version.test.ts tests/update-helpers.test.ts tests/discord.session-store.durable.test.ts`
- `bunx tsc --noEmit`
- `specsync check --spec discord --spec plugins --spec cli`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
- `specs/plugins/context.md`
- `specs/cli/context.md`
