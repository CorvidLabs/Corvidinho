---
module: discord
change: harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge
---

# Delta — discord (memory acting env hygiene)

## Modified

### REQUIREMENT REQ-discord-021

Corvidinho SHALL persist conversations, entities, people, and personality notes
in the shared local SQLite database under `~/.local/share/corvidinho/` (schema
version **3**, table `memories`) so they survive process restart (MEMORY-1..4).
Memory SHALL stay local SQLite only — no on-chain, Trust, or Augur path
(MEMORY-3 / MEMORY-ACL-5).

Each memory row SHALL be scoped to `owner_user_id` (acting Discord user id).
Reads and writes SHALL default to that user’s scope only (MEMORY-ACL-1).

Forget, delete, overwrite, and re-attribute operations SHALL require ADMIN
permission re-checked at handler time (MEMORY-ACL-3/4, ADMIN-4, DISCORD-7),
including **self-forget** of one’s own memories. Empty admin/owner lists SHALL
deny-all for forget/override. A non-admin attempt against another user’s
memories SHALL be refused without leaking the other user’s content
(MEMORY-ACL-2). Soft-delete MAY retain audit fields (`deleted_at`,
`deleted_by_user_id`).

The Discord agent spawn SHALL always overwrite `CORVIDINHO_ACTING_DISCORD_USER_ID`
(empty when the run has no acting user) and `CORVIDINHO_ACTING_IS_ADMIN`, so a
value in the bridge's own environment never leaks into a spawned run. Memory
plugins SHALL read identity only from that env, never from argv
(REQ-plugins-011). The spawn SHALL run non-interactive
(`CORVIDINHO_NON_INTERACTIVE=1`, SAFE-1 / CLI-3) and pass only the confirm
tokens found in the human's message as `CORVIDINHO_ACTING_CONFIRM_TOKENS`
(SAFE-4). Re-storing an existing memory key SHALL keep the prior content as a
soft-deleted row (retrievable by ADMIN) rather than overwrite it, so an update
is never a non-admin forget path (MEMORY-ACL-4).

No Discord slash `/memory` SHALL be invented in this requirement — exposure is
via `MemoryStore` + memory plugins used by the agent/session path. Categories
SHALL be `conversation` | `entity` | `person` | `personality`. Fixture tests
without live Discord SHALL cover CRUD, reload, ACL deny, and admin forget.

Acceptance Criteria
- Schema migrates to v3 with `memories` table and owner/category indexes.
- Store + recall scoped to acting owner; four HI categories accepted.
- Reload after reopen DB returns prior rows (MEMORY-4).
- Non-admin cannot forget/override own or others; empty admin deny-all.
- Admin forget soft-deletes with audit fields; refuse path leaks no content.
- No on-chain memory; no new slash command; no ProcessManager.
- Bridge opens MemoryStore on shared DB; package version bumped for ship.
- Discord spawn env carries the dispatching actor, or an empty actor, never an inherited one; it is non-interactive and carries only human-typed confirm tokens.
- Re-storing a key soft-deletes the prior row instead of overwriting it.
- Fixture tests + SpecSync + fledge verify green.
