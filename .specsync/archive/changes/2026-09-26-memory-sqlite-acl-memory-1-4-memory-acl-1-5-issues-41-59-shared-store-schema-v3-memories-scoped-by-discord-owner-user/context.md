---
change: memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user
artifact: context
---

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
