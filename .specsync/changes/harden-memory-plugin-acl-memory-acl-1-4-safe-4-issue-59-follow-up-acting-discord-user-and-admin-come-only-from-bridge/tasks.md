---
change: harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge
artifact: tasks
---

# Tasks

- [x] `src/memory/confirm.ts` HMAC confirm tokens (no schema change)
- [x] Harden memory plugins (argv refusal, env actor, handler-time ADMIN, two-phase, include-deleted admin-only)
- [x] Discord + WATCH spawn env hygiene
- [x] Fixture tests (plugins, confirm, spawn env)
- [x] Spec deltas + CHANGELOG / STATUS / docs
- [x] SpecSync check + fledge verify
