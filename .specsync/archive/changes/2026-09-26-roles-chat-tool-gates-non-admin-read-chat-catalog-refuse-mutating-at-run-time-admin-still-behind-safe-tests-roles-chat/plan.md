---
change: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
artifact: plan
---

# Plan

1. Add roles/mutating helpers under `src/plugins/`.
2. Wire catalog + runPlugin gates; mark files-write/edit mutating.
3. Share ADMIN re-check with memory plugins.
4. Update plugins + agent specs.
5. Add `tests/roles.chat.gates.test.ts` (ROLES-CHAT-7).
6. Bump 0.0.13 + CHANGELOG + STATUS; fledge verify.
