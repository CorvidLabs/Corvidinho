---
change: memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user
artifact: research
---

# Research

Ancestor corvid-agent (archived): `server/memory/` + `server/db/agent-memories.ts`
keyed by `agent_id` — Corvidinho scopes by Discord `owner_user_id` per Leif ACL.
Categories in HI are conversation/entity/person/personality. Soft-delete for
audit (MEMORY-ACL-3). Schema migration mirrors SESSION v1 → schedule v2:
bump `SCHEMA_VERSION` to 3. No arc69 / FTS for v1 HI.
