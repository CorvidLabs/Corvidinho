---
change: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
artifact: testing
---

# Testing

- `tests/roles.chat.gates.test.ts`: (a) non-admin refuses files-write/shell/github-pr-create/memory-forget; catalog omits mutating; (b) admin reaches files-write; admin+allowlist reaches shell still SAFE-gated without allowlist; (c) channel allowlist empty still denies (existing router/config assertion).
- `fledge lanes run verify --non-interactive`
