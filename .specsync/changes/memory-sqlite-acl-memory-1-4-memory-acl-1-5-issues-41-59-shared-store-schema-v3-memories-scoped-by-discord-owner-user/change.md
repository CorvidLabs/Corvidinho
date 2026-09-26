---
id: memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user
state: implementing
type: feature
base_commit: 7d81edc9d105fbea329e71deca99bfe05f100a27
---

# MEMORY SQLite + ACL (MEMORY-1..4 / MEMORY-ACL-1..5 / issues #41 #59): shared store schema v3 memories scoped by Discord owner_user_id; categories conversation/entity/person/personality; ADMIN-only forget/override including self-forget; empty admin deny-all; no slash commands; no on-chain; bump 0.0.4

## Intent

MEMORY SQLite + ACL (MEMORY-1..4 / MEMORY-ACL-1..5 / issues #41 #59): shared store schema v3 memories scoped by Discord owner_user_id; categories conversation/entity/person/personality; ADMIN-only forget/override including self-forget; empty admin deny-all; no slash commands; no on-chain; bump 0.0.4

## Affected Canonical Specs

- `discord`
- `plugins`
- `cli`

## Acceptance Criteria

- Shared corvidinho.db schema v3 adds memories table (owner_user_id, category conversation|entity|person|personality, key, content, timestamps, soft-delete); MemoryStore CRUD scoped to acting Discord user (MEMORY-1..2/ACL-1); reload after reopen (MEMORY-4); local SQLite only no on-chain (MEMORY-3/ACL-5); non-admin cannot forget/override others without leaking content (ACL-2); ADMIN re-check at handler for forget/override of others AND self-forget; empty admin=deny-all (ACL-3/4 ADMIN-4 DISCORD-7); memory plugins (no new slash); fixture tests; package 0.0.4; SpecSync+fledge verify green

## No-spec Rationale

Not applicable
