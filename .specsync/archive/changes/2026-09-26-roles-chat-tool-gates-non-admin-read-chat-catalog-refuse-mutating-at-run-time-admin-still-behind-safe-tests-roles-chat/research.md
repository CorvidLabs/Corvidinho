---
change: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
artifact: research
---

# Research

- Discord `createSpawnAgentClient` always sets CORVIDINHO_NON_INTERACTIVE=1 and CORVIDINHO_ACTING_IS_ADMIN 0|1.
- SAFE-1 already blocks dangerous under non-interactive; gap is dangerous:false mutators (files-write/edit).
- memory `actingIsAdmin` already re-checks owner (IDENTITY-2) — reuse for ROLES-CHAT-6.
