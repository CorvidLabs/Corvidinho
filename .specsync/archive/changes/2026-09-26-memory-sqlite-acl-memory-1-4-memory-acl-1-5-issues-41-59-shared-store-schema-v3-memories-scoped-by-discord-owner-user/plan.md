---
change: memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user
artifact: plan
---

# Plan

1. Schema v3 memories migration in `src/store/db.ts`.
2. `src/memory/` types + MemoryStore ACL API + index exports.
3. `plugins/memory/` store/recall/forget/override; load in builtins.
4. Wire MemoryStore from bridge shared DB; pass acting-user env on spawn.
5. Fixture tests: CRUD, reload, ACL deny, admin forget/override, empty admin.
6. Spec deltas REQ-discord-021 + plugins + cli 0.0.4; STATUS/CHANGELOG/docs.
7. SpecSync check → fledge verify → PR → squash-merge → tag v0.0.4 release.
