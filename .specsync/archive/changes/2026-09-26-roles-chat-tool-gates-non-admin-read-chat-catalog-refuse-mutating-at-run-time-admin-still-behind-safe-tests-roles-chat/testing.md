---
change: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-roles-001` | `tests/roles.chat.gates.test.ts`, `tests/files.plugins.test.ts` | files-write/edit marked mutating; list entries expose mutating. |
| `REQ-plugins-roles-002` | `tests/roles.chat.gates.test.ts` | Non-admin refuses files-write/shell/github-pr-create/memory-forget with "not allowed for your role"; admin files-write ok; shell still SAFE-1 without allowlist. |
| `REQ-agent-roles-001` | `tests/roles.chat.gates.test.ts` | Non-admin catalog omits mutating; admin catalog includes files-write at code tier. |

## Automated coverage

- `bun test tests/roles.chat.gates.test.ts`
- `fledge lanes run verify --non-interactive`
