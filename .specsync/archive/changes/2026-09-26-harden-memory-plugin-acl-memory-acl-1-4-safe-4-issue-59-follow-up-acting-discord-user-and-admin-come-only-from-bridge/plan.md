---
change: harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge
artifact: plan
---

# Plan

1. Add `src/memory/confirm.ts` (+ export from `src/memory/index.ts`).
2. Harden `plugins/memory/commands.ts` (argv refusal, env actor, handler-time
   ADMIN, two-phase forget/override, admin-only include-deleted).
3. Env hygiene in Discord + WATCH spawns.
4. Tests: rewrite `tests/memory.plugins.test.ts` for env actor; add
   `tests/memory.confirm.test.ts` and `tests/memory.spawn-env.test.ts`.
5. Spec deltas: modify REQ-plugins-010 + add REQ-plugins-011; modify
   REQ-discord-021; add REQ-watch-008. Update CHANGELOG / STATUS / docs/discord.md.
6. `specsync change check` → `fledge lanes run verify --non-interactive` →
   review → PR as corvid-agent → CI green → finalize → squash merge.
